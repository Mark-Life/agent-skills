"""Transcript discovery and per-file parsing.

Walks the transcripts root recursively (a `*/*.jsonl` glob only finds main
sessions; subagents and workflow agents live nested under
`<parent-sid>/subagents/**/`), then parses each file one line at a time so
only one transcript's raw JSON is ever in memory at once.
"""

import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .normalize import is_human_text, normalize_command, normalize_sig
from .redact import redact_text

_TOOL_RESULT_CONTENT_CAP = 2000
_INTERRUPT_MARK = "[Request interrupted"


def parse_ts(d):
    """Epoch seconds from a transcript line's timestamp field, or None."""
    raw = d.get("timestamp")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return None


def _classify(dir_parts):
    """kind, parent, run from the directory chain relative to the root."""
    if len(dir_parts) <= 1:
        return "main", None, None
    parent = dir_parts[1]
    kind = "subagent"
    run = None
    for comp in dir_parts[2:]:
        if comp.startswith("wf_"):
            kind = "workflow-agent"
            run = comp
            break
    return kind, parent, run


def _primary_arg(name, inp):
    """Tool-specific primary argument used for ToolRow.arg."""
    if name in ("Read", "Edit", "Write", "NotebookEdit"):
        return inp.get("file_path") or inp.get("path")
    if name in ("Grep", "Glob"):
        return inp.get("pattern")
    if name == "WebFetch":
        return inp.get("url")
    if name == "WebSearch":
        return inp.get("query")
    if name in ("Task", "Agent"):
        return inp.get("subagent_type")
    return None


def _extract_user_content(cont, pend, t, sid, proj, kind, side, tool_rows, bash_rows, err_rows, redact_on):
    """Handle one user-turn's content: join text, join tool_results to their
    pending tool_use, and emit ToolRow/BashRow/ErrorRow rows as a side effect.
    Returns (text, interrupted).
    """
    if isinstance(cont, str):
        return cont, _INTERRUPT_MARK in cont
    if not isinstance(cont, list):
        return "", False

    interrupted = False
    textparts = []
    for b in cont:
        if not isinstance(b, dict):
            continue
        btype = b.get("type")
        if btype == "text":
            textparts.append(b.get("text") or "")
            continue
        if btype != "tool_result":
            continue
        name, inp, t0 = pend.pop(b.get("tool_use_id"), (None, {}, None))
        content = b.get("content")
        if isinstance(content, list):
            content = " ".join(x.get("text", "") for x in content if isinstance(x, dict))
        content = content if isinstance(content, str) else json.dumps(content)[:_TOOL_RESULT_CONTENT_CAP]
        if _INTERRUPT_MARK in content:
            interrupted = True
        is_err = bool(b.get("is_error"))
        dur = (t - t0) if (t is not None and t0 is not None) else None

        if name:
            tool_row = {"sid": sid, "proj": proj, "kind": kind, "tool": name,
                        "err": is_err, "outChars": len(content or ""), "side": side}
            if t0 is not None:
                tool_row["t"] = t0
            if dur is not None:
                tool_row["durSec"] = round(dur, 3)
            arg = _primary_arg(name, inp)
            if arg:
                tool_row["arg"] = arg
            tool_rows.append(tool_row)

            if name == "Bash":
                family, binname = normalize_command(inp.get("command") or "")
                out_cap = 600 if is_err else 200
                bash_row = {"sid": sid, "proj": proj, "kind": kind,
                            "cmd": redact_text((inp.get("command") or "")[:1500], redact_on),
                            "family": family, "bin": binname,
                            "bg": bool(inp.get("run_in_background")),
                            "err": is_err, "outChars": len(content or ""), "side": side,
                            "out": redact_text((content or "")[:out_cap], redact_on)}
                if inp.get("description"):
                    bash_row["desc"] = str(inp.get("description"))[:200]
                if t0 is not None:
                    bash_row["t"] = t0
                if dur is not None:
                    bash_row["durSec"] = round(dur, 3)
                bash_rows.append(bash_row)

        if is_err:
            err_row = {"sid": sid, "proj": proj, "kind": kind,
                       "input": redact_text(json.dumps(inp)[:600], redact_on),
                       "msg": redact_text((content or "")[:600], redact_on),
                       "sig": normalize_sig(content or "")}
            if name:
                err_row["tool"] = name
            if t0 is not None:
                err_row["t"] = t0
            err_rows.append(err_row)

    text = "\n".join(x for x in textparts if x).strip()
    if _INTERRUPT_MARK in text:
        interrupted = True
    return text, interrupted


def parse_transcript(path, sid, proj, kind, parent, run, file_bytes, redact_on):
    """Parse one transcript file into (SessionRow or None, tool rows, bash
    rows, user-msg rows, error rows, per-model token usage).

    The per-model usage dict is exact (summed per assistant message) and is
    used only for the tokens.byModel aggregate; it is not part of the
    SessionRow fact-table schema.
    """
    start = end = None
    cwd = branch = ver = None
    assistant_msgs = user_msgs_count = interrupts = 0
    in_tok = out_tok = cr_tok = cc_tok = max_ctx = 0
    first_turn_cache_create = None
    models = Counter()
    tools = Counter()
    model_usage = {}
    pend = {}
    tool_rows, bash_rows, user_rows, err_rows = [], [], [], []

    try:
        fh = open(path, "r", encoding="utf-8", errors="replace")
    except OSError:
        return None, [], [], [], [], {}

    with fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except (json.JSONDecodeError, ValueError):
                continue
            if not isinstance(d, dict):
                continue

            t = parse_ts(d)
            if t is not None:
                start = t if start is None else min(start, t)
                end = t if end is None else max(end, t)
            cwd = d.get("cwd") or cwd
            branch = d.get("gitBranch") or branch
            ver = d.get("version") or ver
            side = bool(d.get("isSidechain"))
            is_meta = bool(d.get("isMeta"))
            typ = d.get("type")
            m = d.get("message") or {}
            cont = m.get("content")

            if typ == "assistant":
                assistant_msgs += 1
                model = m.get("model")
                usage = m.get("usage") or {}
                it = usage.get("input_tokens", 0) or 0
                ot = usage.get("output_tokens", 0) or 0
                crt = usage.get("cache_read_input_tokens", 0) or 0
                cct = usage.get("cache_creation_input_tokens", 0) or 0
                if model:
                    models[model] += 1
                    mu = model_usage.setdefault(model, {"in": 0, "out": 0, "cacheRead": 0, "cacheCreate": 0})
                    mu["in"] += it
                    mu["out"] += ot
                    mu["cacheRead"] += crt
                    mu["cacheCreate"] += cct
                in_tok += it
                out_tok += ot
                cr_tok += crt
                cc_tok += cct
                max_ctx = max(max_ctx, it + crt + cct)
                if first_turn_cache_create is None:
                    first_turn_cache_create = cct
                if isinstance(cont, list):
                    for b in cont:
                        if isinstance(b, dict) and b.get("type") == "tool_use":
                            name = b.get("name")
                            tools[name] += 1
                            pend[b.get("id")] = (name, b.get("input") or {}, t)

            elif typ == "user":
                text, interrupted = _extract_user_content(
                    cont, pend, t, sid, proj, kind, side,
                    tool_rows, bash_rows, err_rows, redact_on,
                )
                tur = d.get("toolUseResult")
                if isinstance(tur, dict) and tur.get("interrupted"):
                    interrupted = True
                if interrupted:
                    interrupts += 1
                if text:
                    user_msgs_count += 1
                    row = {"sid": sid, "proj": proj, "kind": kind,
                           "text": redact_text(text[:4000], redact_on),
                           "side": side,
                           "human": is_human_text(text, kind, side, is_meta)}
                    if t is not None:
                        row["t"] = t
                    user_rows.append(row)

    if assistant_msgs == 0 and user_msgs_count == 0:
        return None, tool_rows, bash_rows, user_rows, err_rows, model_usage

    session = {"sid": sid, "proj": proj, "file": str(path), "bytes": file_bytes, "kind": kind}
    if cwd:
        session["cwd"] = cwd
    if branch:
        session["branch"] = branch
    if ver:
        session["ver"] = ver
    if start is not None:
        session["start"] = start
    if end is not None:
        session["end"] = end
    if parent:
        session["parent"] = parent
    if run:
        session["run"] = run
    session.update({
        "assistantMsgs": assistant_msgs,
        "userMsgs": user_msgs_count,
        "inTokens": in_tok,
        "outTokens": out_tok,
        "cacheReadTokens": cr_tok,
        "cacheCreateTokens": cc_tok,
        "maxCtx": max_ctx,
        "firstTurnCacheCreate": first_turn_cache_create or 0,
        "models": dict(models),
        "tools": dict(tools),
        "interrupts": interrupts,
        "errors": sum(1 for r in tool_rows if r.get("err")),
    })
    return session, tool_rows, bash_rows, user_rows, err_rows, model_usage


def _iter_candidates(root: Path):
    """All *.jsonl transcript candidates under root, deterministically
    ordered, skipping journal.jsonl (*.meta.json is a different extension and
    is never matched by the *.jsonl walk).
    """
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for fn in filenames:
            if fn.endswith(".jsonl") and fn != "journal.jsonl":
                found.append(Path(dirpath) / fn)
    found.sort(key=lambda p: str(p))
    return found


def scan_all(root, days, project_filters, redact_on, progress_stream=None):
    """Walk root and parse every in-window transcript.

    Returns (sessions, tools, bashRows, userMsgs, errors, stats) where stats
    has filesScanned, filesSkipped, fromTs, toTs, modelTokens (exact per-model
    token totals, used only for the tokens.byModel aggregate).
    """
    progress_stream = sys.stderr if progress_stream is None else progress_stream
    root = Path(root)
    now = time.time()
    cutoff = now - days * 86400
    project_filters = project_filters or []

    candidates = _iter_candidates(root) if root.exists() else []
    total = len(candidates)

    sessions, tools, bash_rows, user_msgs, errors = [], [], [], [], []
    model_tokens = {}
    files_scanned = files_skipped = 0

    for idx, path in enumerate(candidates, 1):
        try:
            rel_parts = path.relative_to(root).parts
        except ValueError:
            files_skipped += 1
            continue
        if len(rel_parts) < 2:
            files_skipped += 1
            continue
        proj = rel_parts[0]
        if project_filters and not any(pf in proj for pf in project_filters):
            files_skipped += 1
            continue
        try:
            st = path.stat()
        except OSError:
            files_skipped += 1
            continue
        if st.st_mtime < cutoff:
            files_skipped += 1
            continue

        kind, parent, run = _classify(rel_parts[:-1])
        sid = path.name[:-6] if path.name.endswith(".jsonl") else path.name

        session, t_rows, b_rows, u_rows, e_rows, mu = parse_transcript(
            path, sid, proj, kind, parent, run, st.st_size, redact_on,
        )
        files_scanned += 1
        if session is not None:
            sessions.append(session)
        tools.extend(t_rows)
        bash_rows.extend(b_rows)
        user_msgs.extend(u_rows)
        errors.extend(e_rows)
        for model, counts in mu.items():
            acc = model_tokens.setdefault(model, {"in": 0, "out": 0, "cacheRead": 0, "cacheCreate": 0})
            for k, v in counts.items():
                acc[k] += v

        if idx % 100 == 0 or idx == total:
            print(f"scanned {idx}/{total} files...", file=progress_stream)

    stats = {"filesScanned": files_scanned, "filesSkipped": files_skipped, "fromTs": cutoff, "toTs": now,
              "modelTokens": model_tokens}
    return sessions, tools, bash_rows, user_msgs, errors, stats
