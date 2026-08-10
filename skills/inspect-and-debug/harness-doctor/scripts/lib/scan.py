"""Transcript discovery and per-file parsing.

The Python twin of `lib/scan.ts`, row for row: same walk, same classification,
same joins, so the five fact tables are interchangeable between the runtimes.

Two things the tree teaches you: transcripts nest, and most of them are nested.
A `*/*.jsonl` glob finds only main sessions; subagents and workflow agents live
under `<parent-sid>/subagents/**/`. Memory: one file is read, turned into rows,
and released before the next one opens.
"""

import json
import math
import os
import sys
import time
from datetime import datetime, timezone

from .normalize import is_human_text, normalize_command, normalize_sig, strip_harness
from .redact import redact_text

MAX_TEXT = 4000
MAX_ERR = 600
MAX_OUT_OK = 200
MAX_OUT_ERR = 600
MAX_ARG = 500

_INTERRUPT_MARK = "[Request interrupted"


def _epoch_ms(raw):
    """ISO timestamp to epoch milliseconds, or None when unusable."""
    if not isinstance(raw, str) or not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp() * 1000


def _epoch(raw):
    """ISO timestamp to whole epoch seconds, or None when unusable."""
    ms = _epoch_ms(raw)
    return None if ms is None else int(ms // 1000)


def _json_compact(value):
    """JSON with no spaces, the way JSON.stringify writes it."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _str(value):
    """Anything to a string: strings pass through, objects become JSON."""
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    return _json_compact(value)


def _result_text(content):
    """Flatten a tool_result `content`: a string, or text blocks in an array."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                parts.append(_str(b.get("text")))
            else:
                parts.append("")
        return "\n".join(parts)
    return "" if content is None else _str(content)


def _clip(s, n):
    """Cut a string to n UTF-16 code units, the unit the TypeScript twin cuts on.

    A split surrogate pair is dropped rather than kept as a lone half, which is
    the one place this differs from JS `slice`.
    """
    if _utf16_len(s) <= n:
        return s
    cut = s.encode("utf-16-le")[: n * 2]
    return cut.decode("utf-16-le", "ignore")


def _utf16_len(s):
    """Length in UTF-16 code units, the unit JS `String.length` counts in.

    An emoji is two units there and one character here, so counting characters
    would make outChars disagree with the TypeScript twin on the same row.
    """
    return len(s.encode("utf-16-le")) // 2


def _round3(value):
    """Round half up to milliseconds, as JS does, and drop a trailing .0."""
    out = math.floor(value * 1000 + 0.5) / 1000
    return int(out) if out == int(out) else out


def _primary_arg(tool, inp):
    """The tool-specific argument that identifies what a call touched."""
    def pick(*keys):
        for k in keys:
            v = inp.get(k)
            if isinstance(v, str) and v:
                return v
        return None

    if tool in ("Read", "Edit", "Write", "MultiEdit", "NotebookEdit"):
        return pick("file_path", "notebook_path", "path")
    if tool in ("Grep", "Glob"):
        return pick("pattern")
    if tool == "WebFetch":
        return pick("url")
    if tool == "WebSearch":
        return pick("query")
    if tool in ("Agent", "Task"):
        return pick("subagent_type", "description")
    if tool == "Skill":
        return pick("skill", "command")
    return None


def _collate(name):
    """Sort key approximating JS localeCompare: case-insensitive, then exact.

    The walk order decides row order in the fact tables, and the TypeScript twin
    sorts with localeCompare, which puts "-private" before "-Users".
    """
    return (name.lower(), name)


def classify(parts):
    """kind, parent, run from the path parts below the project dir.

    Depth 1 is a main session. A `wf_*` dir whose immediate parent is named
    `workflows` makes a workflow agent; anything else nested is a subagent.
    """
    if len(parts) <= 1:
        return "main", None, None
    parent = parts[0]
    for i, part in enumerate(parts):
        if part.startswith("wf_") and i > 0 and parts[i - 1] == "workflows":
            return "workflow-agent", parent, part
    return "subagent", parent, None


def list_transcripts(root, projects=None):
    """Every transcript under root, sorted by path so two runs agree.

    `projects` filters project dirs by substring.
    """
    projects = projects or []
    found = []
    try:
        project_dirs = sorted(
            (d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))), key=_collate
        )
    except OSError:
        return found
    for proj in project_dirs:
        if projects and not any(p in proj for p in projects):
            continue
        proj_root = os.path.join(root, proj)
        for dirpath, dirnames, filenames in os.walk(proj_root):
            dirnames.sort(key=_collate)
            rel = os.path.relpath(dirpath, proj_root)
            dir_parts = [] if rel == "." else rel.split(os.sep)
            for name in sorted(filenames, key=_collate):
                if not name.endswith(".jsonl") or name == "journal.jsonl":
                    continue
                kind, parent, run = classify(dir_parts + [name])
                found.append({
                    "file": os.path.join(dirpath, name),
                    "proj": proj,
                    "sid": name[: -len(".jsonl")],
                    "kind": kind,
                    "parent": parent,
                    "run": run,
                })
    found.sort(key=lambda r: _collate(r["file"]))
    return found


def _row(pairs):
    """A row dict in field order, with absent values omitted, never null."""
    return {k: v for k, v in pairs if v is not None}


def parse_transcript(ref, file_bytes, redact_on):
    """Parse one transcript into (session, tools, bash, userMsgs, errors).

    Malformed lines are skipped silently: a live session's last line is often
    half-written.
    """
    sid, proj, kind = ref["sid"], ref["proj"], ref["kind"]
    tools, bash, user_msgs, errors = [], [], [], []
    pending = {}
    seen_results = set()
    seen_turns = set()
    models = {}
    tool_counts = {}

    session = {
        "sid": sid,
        "proj": proj,
        "file": ref["file"],
        "bytes": file_bytes,
        "kind": kind,
    }
    if ref.get("parent"):
        session["parent"] = ref["parent"]
    if ref.get("run"):
        session["run"] = ref["run"]
    session.update({
        "assistantMsgs": 0,
        "userMsgs": 0,
        "inTokens": 0,
        "outTokens": 0,
        "cacheReadTokens": 0,
        "cacheCreateTokens": 0,
        "maxCtx": 0,
        "firstTurnCacheCreate": 0,
        "models": models,
        "tools": tool_counts,
        "interrupts": 0,
        "errors": 0,
    })
    first_turn_seen = False

    def push_user_msg(text_raw, t, side, is_meta):
        """Record one user turn, flagging whether a human really typed it."""
        if _INTERRUPT_MARK in text_raw:
            session["interrupts"] += 1
        stripped = strip_harness(text_raw)
        body = stripped or text_raw.strip()
        user_msgs.append(_row([
            ("sid", sid), ("proj", proj), ("kind", kind), ("t", t),
            ("text", redact_text(_clip(body, MAX_TEXT), redact_on)),
            ("side", side),
            ("human", is_human_text(stripped, kind, side, is_meta)),
        ]))

    def emit_call(tool, inp, t, dur_sec, err, text, side):
        """A ToolRow always, plus a BashRow and an ErrorRow when due."""
        out_chars = _utf16_len(text)
        arg = _primary_arg(tool, inp)
        tools.append(_row([
            ("sid", sid), ("proj", proj), ("kind", kind), ("t", t), ("tool", tool),
            ("durSec", dur_sec), ("err", err), ("outChars", out_chars),
            ("arg", _clip(arg, MAX_ARG) if arg else None), ("side", side),
        ]))
        if tool == "Bash":
            cmd = _str(inp.get("command", inp.get("cmd", "")))
            n = normalize_command(cmd)
            desc = inp.get("description")
            bash.append(_row([
                ("sid", sid), ("proj", proj), ("kind", kind), ("t", t),
                ("durSec", dur_sec), ("err", err), ("outChars", out_chars),
                ("cmd", redact_text(cmd, redact_on)),
                ("desc", desc if isinstance(desc, str) else None),
                ("family", n["family"]), ("bin", n["bin"]),
                ("bg", inp.get("run_in_background") is True or n["background"]),
                ("out", redact_text(_clip(text, MAX_OUT_ERR if err else MAX_OUT_OK), redact_on)),
                ("side", side),
            ]))
        if not err:
            return
        msg_text = redact_text(_clip(text, MAX_ERR), redact_on)
        errors.append(_row([
            ("sid", sid), ("proj", proj), ("kind", kind), ("t", t), ("tool", tool),
            ("input", redact_text(_clip(_json_compact(inp), MAX_ERR), redact_on)),
            ("msg", msg_text), ("sig", normalize_sig(msg_text)),
        ]))

    try:
        fh = open(ref["file"], "r", encoding="utf-8", errors="replace")
    except OSError:
        return session, tools, bash, user_msgs, errors

    with fh:
        for line in fh:
            if not line.strip():
                continue
            try:
                o = json.loads(line)
            except (json.JSONDecodeError, ValueError):
                continue
            if not isinstance(o, dict):
                continue

            typ = str(o.get("type") or "")
            t = _epoch(o.get("timestamp"))
            t_ms = _epoch_ms(o.get("timestamp"))
            if t is not None:
                if "start" not in session:
                    session["start"] = t
                session["end"] = t
            if isinstance(o.get("cwd"), str) and not session.get("cwd"):
                session["cwd"] = o["cwd"]
            if isinstance(o.get("gitBranch"), str) and o["gitBranch"]:
                session["branch"] = o["gitBranch"]
            if isinstance(o.get("version"), str):
                session["ver"] = o["version"]
            side = o.get("isSidechain") is True
            msg = o.get("message") or {}
            if not isinstance(msg, dict):
                msg = {}

            if typ == "assistant":
                session["assistantMsgs"] += 1
                model = str(msg.get("model") or "unknown")
                usage = msg.get("usage")
                turn_key = str(
                    o.get("requestId") or msg.get("id") or ("line-%d" % session["assistantMsgs"])
                )
                if turn_key not in seen_turns and isinstance(usage, dict):
                    seen_turns.add(turn_key)
                    in_tok = usage.get("input_tokens") or 0
                    out_tok = usage.get("output_tokens") or 0
                    cr = usage.get("cache_read_input_tokens") or 0
                    cc = usage.get("cache_creation_input_tokens") or 0
                    session["inTokens"] += in_tok
                    session["outTokens"] += out_tok
                    session["cacheReadTokens"] += cr
                    session["cacheCreateTokens"] += cc
                    session["maxCtx"] = max(session["maxCtx"], in_tok + cr + cc)
                    models[model] = models.get(model, 0) + 1
                    if not first_turn_seen:
                        session["firstTurnCacheCreate"] = cc
                        first_turn_seen = True
                content = msg.get("content")
                for b in content if isinstance(content, list) else []:
                    if not isinstance(b, dict) or b.get("type") != "tool_use":
                        continue
                    tool = str(b.get("name") or "tool")
                    call_id = b.get("id") if isinstance(b.get("id"), str) else ""
                    inp = b.get("input")
                    inp = inp if isinstance(inp, dict) else {}
                    tool_counts[tool] = tool_counts.get(tool, 0) + 1
                    if call_id:
                        pending[call_id] = {"tool": tool, "input": inp, "tMs": t_ms, "side": side}
                continue

            if typ != "user":
                continue
            session["userMsgs"] += 1
            tur = o.get("toolUseResult")
            tur = tur if isinstance(tur, dict) else {}
            if tur.get("interrupted") is True:
                session["interrupts"] += 1
            content = msg.get("content")

            if isinstance(content, str):
                push_user_msg(content, t, side, o.get("isMeta") is True)
                continue
            if not isinstance(content, list):
                continue

            for b in content:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text":
                    push_user_msg(_str(b.get("text")), t, side, o.get("isMeta") is True)
                    continue
                if b.get("type") != "tool_result":
                    continue
                call_id = b.get("tool_use_id") if isinstance(b.get("tool_use_id"), str) else ""
                if call_id and call_id in seen_results:
                    continue
                if call_id:
                    seen_results.add(call_id)
                call = pending.pop(call_id, None) if call_id else None
                text = _result_text(b.get("content"))
                if not text and (isinstance(tur.get("stdout"), str) or isinstance(tur.get("stderr"), str)):
                    text = _str(tur.get("stdout")) + _str(tur.get("stderr"))
                if _INTERRUPT_MARK in text:
                    session["interrupts"] += 1
                err = b.get("is_error") is True
                if err:
                    session["errors"] += 1
                call_t_ms = call["tMs"] if call else None
                call_t = int(call_t_ms // 1000) if call_t_ms is not None else t
                dur_sec = None
                if call_t_ms is not None and t_ms is not None:
                    dur_sec = max(0, _round3((t_ms - call_t_ms) / 1000))
                emit_call(
                    call["tool"] if call else "unknown",
                    call["input"] if call else {},
                    call_t, dur_sec, err, text,
                    call["side"] if call else side,
                )

    # Tool calls whose result never arrived: the session ended or was interrupted.
    for call in pending.values():
        emit_call(
            call["tool"], call["input"],
            int(call["tMs"] // 1000) if call["tMs"] is not None else None,
            None, False, "", call["side"],
        )

    return session, tools, bash, user_msgs, errors


def scan_all(root, days, project_filters, redact_on, progress_stream=None):
    """Scan every transcript in the window and return the tables plus counters.

    Returns (sessions, tools, bash, userMsgs, errors, stats) where stats carries
    filesScanned, filesSkipped, projectCount, fromEpoch, toEpoch.
    """
    progress_stream = sys.stderr if progress_stream is None else progress_stream
    to_epoch = int(time.time())
    from_epoch = to_epoch - days * 86400
    refs = list_transcripts(str(root), project_filters)

    sessions, tools, bash, user_msgs, errors = [], [], [], [], []
    seen_projects = set()
    scanned = skipped = 0

    for i, ref in enumerate(refs):
        try:
            st = os.stat(ref["file"])
        except OSError:
            skipped += 1
            continue
        mtime = int(st.st_mtime)
        # A file untouched since before the window cannot hold activity inside it.
        if mtime < from_epoch:
            skipped += 1
            continue
        session, t_rows, b_rows, u_rows, e_rows = parse_transcript(ref, st.st_size, redact_on)
        end = session.get("end", mtime)
        if end < from_epoch:
            skipped += 1
            continue
        scanned += 1
        seen_projects.add(ref["proj"])
        sessions.append(session)
        tools.extend(t_rows)
        bash.extend(b_rows)
        user_msgs.extend(u_rows)
        errors.extend(e_rows)
        if scanned % 200 == 0 or i == len(refs) - 1:
            print(
                "scanned %d/%d files, %d tool calls, %d bash" % (scanned, len(refs), len(tools), len(bash)),
                file=progress_stream,
            )
    print(
        "scan done: %d transcripts, %d skipped, %d projects" % (scanned, skipped, len(seen_projects)),
        file=progress_stream,
    )

    stats = {
        "filesScanned": scanned,
        "filesSkipped": skipped,
        "projectCount": len(seen_projects),
        "fromEpoch": from_epoch,
        "toEpoch": to_epoch,
    }
    return sessions, tools, bash, user_msgs, errors, stats
