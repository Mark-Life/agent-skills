"""Turn the five fact tables into the audit report.

The Python twin of `lib/aggregate.ts`: the same sections, the same field names
from `lib/types.ts`, and the same `{rows, shown, total, dropped}` wrapper around
every ranking, so `--format json` is interchangeable between the runtimes.
Everything is deterministic: rankings sort by their metric then by a stable
string key, and every record is built with sorted keys.
"""

import time

from . import cost as cost_mod
from .aggregate_commands import commands_section, errors_section
from .aggregate_human import human_section
from .aggregate_projects import projects_section
from .stats import (
    clip, group_by, iso_of, median, percentile, ranking, round_to, safe_div,
    sorted_record, top_key, total, uniq_sorted,
)

# Session kinds in fixed report order, so the JSON never reorders.
_KINDS = ("main", "subagent", "workflow-agent")

# The two web tools this audit tracks.
_WEB_TOOLS = ("WebFetch", "WebSearch")

# Chars per token, the estimate used for anything not covered by usage metadata.
_CHARS_PER_TOKEN = 4


def _no_totals():
    return {"in": 0, "out": 0, "cacheRead": 0, "cacheCreate": 0}


def _totals_of(session):
    """A session's usage as a token-totals block."""
    return {
        "in": session.get("inTokens", 0),
        "out": session.get("outTokens", 0),
        "cacheRead": session.get("cacheReadTokens", 0),
        "cacheCreate": session.get("cacheCreateTokens", 0),
    }


def _sum_totals(sessions):
    """Sum token totals over sessions."""
    acc = _no_totals()
    for s in sessions:
        t = _totals_of(s)
        for key in acc:
            acc[key] += t[key]
    return acc


def _round_totals(t):
    """Round a totals block to whole tokens."""
    return {key: int(round_to(value, 0)) for key, value in t.items()}


def _grand_total(t):
    """Every token in a totals block, for ranking by size."""
    return t["in"] + t["out"] + t["cacheRead"] + t["cacheCreate"]


def _split_by_model(session):
    """Split a session's tokens across its models, in proportion to call counts.

    Usage is recorded per session, not per model, so this is an attribution, not
    a measurement: it only matters for sessions that switched model mid-run.
    """
    models = sorted(session.get("models") or {})
    calls = sum((session.get("models") or {}).get(m, 0) for m in models)
    totals = _totals_of(session)
    if not models or calls == 0:
        return [("(unknown)", totals)]
    out = []
    for model in models:
        share = (session["models"].get(model, 0)) / calls
        out.append((model, {key: value * share for key, value in totals.items()}))
    return out


def _session_cost(session, pricing):
    """Estimated USD for one session, priced per model slice."""
    usd = 0.0
    for model, totals in _split_by_model(session):
        usage = dict(totals)
        usage["model"] = model
        usd += cost_mod.estimate_cost(usage, pricing)
    return usd


def _cost_of(sessions, pricing):
    """Estimated USD for a set of sessions, summed left to right like the twin."""
    return total(sessions, lambda s: _session_cost(s, pricing))


def _window_section(days, sessions, stats):
    by_kind = [(kind, len([s for s in sessions if s["kind"] == kind])) for kind in _KINDS]
    return {
        "days": days,
        "fromIso": iso_of(stats["fromEpoch"]),
        "toIso": iso_of(stats["toEpoch"]),
        "filesScanned": stats["filesScanned"],
        "filesSkipped": stats["filesSkipped"],
        "sessionsByKind": sorted_record(by_kind),
        "projectCount": stats.get("projectCount", len({s["proj"] for s in sessions})),
    }


def _tokens_section(sessions, pricing, top):
    """Tokens split every useful way, with the cost estimate and its price table."""
    by_model = {}
    unpriced = set()
    for s in sessions:
        for model, totals in _split_by_model(s):
            acc = by_model.setdefault(model, _no_totals())
            for key in acc:
                acc[key] += totals[key]
            known = model != "(unknown)" and cost_mod.price_for(model, pricing)["priced"]
            if not known and _grand_total(totals) > 0:
                unpriced.add(model)
    by_kind = [
        (kind, _round_totals(_sum_totals([s for s in sessions if s["kind"] == kind])))
        for kind in _KINDS
    ]
    projects = [{
        "proj": proj,
        "totals": _round_totals(_sum_totals(rows)),
        "estCostUsd": round_to(_cost_of(rows, pricing), 4),
        "sessions": len(rows),
    } for proj, rows in group_by(sessions, lambda s: s["proj"]).items()]
    return {
        "totals": _round_totals(_sum_totals(sessions)),
        "byModel": sorted_record([(m, _round_totals(t)) for m, t in by_model.items()]),
        "byKind": sorted_record(by_kind),
        "byProject": ranking(projects, lambda r: _grand_total(r["totals"]), lambda r: r["proj"], top),
        "estCostUsd": round_to(_cost_of(sessions, pricing), 2),
        "pricing": pricing,
        "unpricedModels": uniq_sorted(unpriced),
        "note": cost_mod.PRICING_NOTE,
    }


def _bash_as_tools(bash):
    """Bash rows viewed as tool rows, so wall-clock and big outputs cover them."""
    return [{
        "sid": b["sid"], "proj": b["proj"], "kind": b["kind"], "t": b.get("t"),
        "tool": "Bash", "durSec": b.get("durSec"), "err": b.get("err", False),
        "outChars": b.get("outChars", 0), "arg": clip(b.get("cmd", ""), 200),
        "side": b.get("side", False),
    } for b in bash]


def _all_tool_rows(tools, bash):
    """Tool rows plus bash rows, without double counting."""
    if any(r.get("tool") == "Bash" for r in tools):
        return list(tools)
    return list(tools) + _bash_as_tools(bash)


def _wall_clock_section(rows, top):
    """Seconds attributed to tool calls, by tool and by project."""
    by_tool = []
    for tool, group in group_by(rows, lambda r: r.get("tool", "")).items():
        secs = [r.get("durSec") or 0 for r in group]
        by_tool.append({
            "tool": tool,
            "calls": len(group),
            "totalSec": round_to(total(secs), 1),
            "medianSec": round_to(median(secs), 2),
            "p95Sec": round_to(percentile(secs, 0.95), 2),
            "errRate": round_to(safe_div(len([r for r in group if r.get("err")]), len(group)), 4),
        })
    by_project = [{
        "proj": proj,
        "calls": len(group),
        "totalSec": round_to(total(group, lambda r: r.get("durSec") or 0), 1),
    } for proj, group in group_by(rows, lambda r: r.get("proj", "")).items()]
    return {
        "totalToolSec": round_to(total(rows, lambda r: r.get("durSec") or 0), 1),
        "byTool": ranking(by_tool, lambda r: r["totalSec"], lambda r: r["tool"], top),
        "byProject": ranking(by_project, lambda r: r["totalSec"], lambda r: r["proj"], top),
        "note": (
            "durSec is the gap between a tool call and its result: it includes harness "
            "overhead, model thinking between blocks, and any wait for approval. Treat "
            "it as an upper bound on real tool time."
        ),
    }


def _context_section(sessions, rows, pricing, top):
    """What filled the context window, and what refilled it."""
    top_sessions = [{
        "sid": s["sid"], "proj": s["proj"], "kind": s["kind"],
        "maxCtx": s.get("maxCtx", 0),
        "cacheReadTokens": s.get("cacheReadTokens", 0),
        "cacheCreateTokens": s.get("cacheCreateTokens", 0),
        "estCostUsd": round_to(_session_cost(s, pricing), 4),
    } for s in sessions]

    big_outputs = []
    for r in rows:
        if r.get("outChars", 0) <= 0:
            continue
        row = {"sid": r["sid"], "proj": r["proj"], "tool": r.get("tool", "")}
        if r.get("arg") is not None:
            row["arg"] = clip(r["arg"], 200)
        row["outChars"] = r["outChars"]
        row["tokensEst"] = int(round_to(r["outChars"] / _CHARS_PER_TOKEN, 0))
        big_outputs.append(row)

    p95_chars = [
        (tool, int(round_to(percentile([r.get("outChars", 0) for r in group], 0.95), 0)))
        for tool, group in group_by(rows, lambda r: r.get("tool", "")).items()
    ]

    per_arg = {}
    reads = [r for r in rows if r.get("tool") == "Read" and r.get("arg")]
    for _, group in group_by(reads, lambda r: "%s %s" % (r["sid"], r.get("arg", ""))).items():
        if len(group) < 2:
            continue
        first = group[0]
        entry = per_arg.setdefault(first["arg"], {"occurrences": 0, "sessions": set(), "chars": 0})
        entry["occurrences"] += len(group) - 1
        entry["sessions"].add(first["sid"])
        entry["chars"] += total(group[1:], lambda r: r.get("outChars", 0))
    re_reads = [{
        "arg": clip(arg, 200), "occurrences": e["occurrences"], "sessions": len(e["sessions"]),
        "wastedTokensEst": int(round_to(e["chars"] / _CHARS_PER_TOKEN, 0)),
    } for arg, e in per_arg.items()]

    cache_write_ratio = []
    for kind in _KINDS:
        group = [s for s in sessions if s["kind"] == kind]
        create = total(group, lambda s: s.get("cacheCreateTokens", 0))
        read = total(group, lambda s: s.get("cacheReadTokens", 0))
        cache_write_ratio.append((kind, round_to(safe_div(create, create + read), 4)))

    return {
        "topSessions": ranking(top_sessions, lambda r: r["maxCtx"], lambda r: r["sid"], top),
        "bigOutputs": ranking(
            big_outputs, lambda r: r["outChars"],
            lambda r: "%s %s %s" % (r["tool"], r.get("arg", ""), r["sid"]), top,
        ),
        "p95CharsByTool": sorted_record(p95_chars),
        "reReads": ranking(re_reads, lambda r: r["wastedTokensEst"], lambda r: r["arg"], top),
        "cacheWriteRatio": sorted_record(cache_write_ratio),
    }


def _web_section(tools, run_by_sid, top):
    """WebFetch and WebSearch: volume, repeats, and the runs they landed in."""
    web = [r for r in tools if r.get("tool") in _WEB_TOOLS]
    by_tool = []
    for tool in _WEB_TOOLS:
        group = [r for r in web if r.get("tool") == tool]
        by_tool.append((tool, {
            "calls": len(group),
            "sec": round_to(total(group, lambda r: r.get("durSec") or 0), 1),
            "chars": int(total(group, lambda r: r.get("outChars", 0))),
        }))

    repeats = []
    repeat_calls = 0
    keyed = [r for r in web if r.get("arg")]
    for _, group in group_by(keyed, lambda r: "%s %s" % (r.get("tool", ""), r.get("arg", ""))).items():
        if len(group) < 2:
            continue
        first = group[0]
        repeat_calls += len(group) - 1
        runs = {run_by_sid.get(r["sid"], "") for r in group}
        repeats.append({
            "tool": first.get("tool", ""),
            "arg": clip(first.get("arg", ""), 200),
            "count": len(group),
            "chars": int(total(group, lambda r: r.get("outChars", 0))),
            "sessions": len({r["sid"] for r in group}),
            "sameRun": len(runs) == 1 and "" not in runs,
        })

    in_runs = [r for r in web if run_by_sid.get(r["sid"])]
    by_run = [{
        "run": run,
        "calls": len(group),
        "chars": int(total(group, lambda r: r.get("outChars", 0))),
        "agents": len({r["sid"] for r in group}),
    } for run, group in group_by(in_runs, lambda r: run_by_sid.get(r["sid"], "")).items()]

    return {
        "byTool": sorted_record(by_tool),
        "totalCalls": len(web),
        "totalSec": round_to(total(web, lambda r: r.get("durSec") or 0), 1),
        "totalChars": int(total(web, lambda r: r.get("outChars", 0))),
        "repeatRate": round_to(safe_div(repeat_calls, len(web)), 4),
        "repeats": ranking(repeats, lambda r: r["count"], lambda r: "%s %s" % (r["tool"], r["arg"]), top),
        "byRun": ranking(by_run, lambda r: r["calls"], lambda r: r["run"], top),
    }


def _fanout_section(sessions, pricing, top):
    """What each workflow run spent, and which agents read without writing."""
    agents = [s for s in sessions if s["kind"] != "main"]
    wf = [s for s in sessions if s["kind"] == "workflow-agent" and s.get("run")]
    runs = []
    for run, group in group_by(wf, lambda s: s.get("run", "")).items():
        projs = {}
        for s in group:
            projs[s["proj"]] = projs.get(s["proj"], 0) + 1
        runs.append({
            "run": run,
            "proj": top_key(projs),
            "agents": len(group),
            "totals": _round_totals(_sum_totals(group)),
            "estCostUsd": round_to(_cost_of(group, pricing), 4),
            "medianFirstTurnCacheCreate": int(
                round_to(median([s.get("firstTurnCacheCreate", 0) for s in group]), 0)
            ),
        })

    candidates = [s for s in agents if s.get("cacheReadTokens", 0) > 0]
    yields = [s["outTokens"] / s["cacheReadTokens"] for s in candidates]
    threshold = percentile(yields, 0.1)
    low_yield = []
    for s in candidates:
        ratio = s["outTokens"] / s["cacheReadTokens"]
        if ratio > threshold:
            continue
        row = {"sid": s["sid"]}
        if s.get("run") is not None:
            row["run"] = s["run"]
        row.update({
            "proj": s["proj"],
            "outTokens": s.get("outTokens", 0),
            "cacheReadTokens": s.get("cacheReadTokens", 0),
            "yield": round_to(ratio, 6),
            "estCostUsd": round_to(_session_cost(s, pricing), 4),
        })
        low_yield.append(row)

    return {
        "runs": ranking(runs, lambda r: r["estCostUsd"], lambda r: r["run"], top),
        "lowYield": ranking(low_yield, lambda r: r["cacheReadTokens"], lambda r: r["sid"], top),
        "agentsWithFirstTurnCacheWrite": len([s for s in agents if s.get("firstTurnCacheCreate", 0) > 0]),
        "totalFirstTurnCacheCreate": int(total(wf, lambda s: s.get("firstTurnCacheCreate", 0))),
    }


def _resolve_to_epoch(sessions, given):
    """Window end: the caller's value, else the latest timestamp, else now."""
    if isinstance(given, (int, float)) and given > 0:
        return given
    stamps = [s.get("end") or 0 for s in sessions] + [s.get("start") or 0 for s in sessions]
    latest = max(stamps) if stamps else 0
    return latest if latest > 0 else int(time.time())


def build(sessions, tools, bash, user_msgs, errors, stats, days, pricing, top, check_disk=True):
    """Build the whole report from the fact tables, `schemaVersion` included."""
    top = max(1, int(top))
    to_epoch = _resolve_to_epoch(sessions, stats.get("toEpoch"))
    from_epoch = stats.get("fromEpoch")
    if from_epoch is None:
        from_epoch = to_epoch - days * 86400
    window_stats = {
        "fromEpoch": from_epoch,
        "toEpoch": to_epoch,
        "filesScanned": stats.get("filesScanned", len(sessions)),
        "filesSkipped": stats.get("filesSkipped", 0),
        "projectCount": stats.get("projectCount", len({s["proj"] for s in sessions})),
    }
    merged = _all_tool_rows(tools, bash)
    run_by_sid = {s["sid"]: s["run"] for s in sessions if s.get("run")}
    return {
        "schemaVersion": 1,
        "window": _window_section(days, sessions, window_stats),
        "tokens": _tokens_section(sessions, pricing, top),
        "wallClock": _wall_clock_section(merged, top),
        "commands": commands_section(bash, top),
        "errors": errors_section(errors, bash, top),
        "context": _context_section(sessions, merged, pricing, top),
        "web": _web_section(tools, run_by_sid, top),
        "fanout": _fanout_section(sessions, pricing, top),
        "human": human_section(user_msgs, sessions, top),
        "projects": projects_section(
            sessions, bash, top, check_disk,
            lambda group: _round_totals(_sum_totals(group)),
            lambda group: _cost_of(group, pricing),
        ),
    }
