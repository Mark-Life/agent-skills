"""Aggregate the fact-table rows into the harness-doctor report sections.

Every ranking is deterministic: sort by the metric (descending unless noted),
then by a stable string tiebreaker, then cap to top_n. The (rows, droppedCount)
shape lets callers report how many rows a ranking cut off.
"""

import json
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from . import cost as cost_mod

_MISSING_BIN_MARKERS = ("command not found", "No such file or directory", "ENOENT")
_PERMISSION_MARKERS = ("Permission denied", "EACCES")
_INTERRUPT_MARK = "[Request interrupted"
_FLAG_FLAIL_WINDOW_SEC = 600
_RETRY_LOOP_WINDOW_SEC = 300

_CORRECTION_BUCKETS = (
    ("negation", re.compile(r"(?i)\bno[,.!]|\bnot what i (?:asked|wanted|meant)\b")),
    ("wrong", re.compile(r"(?i)\bwrong\b|\bincorrect\b|\bthat.?s not right\b")),
    ("revert", re.compile(r"(?i)\brevert\b|\bundo\b|\broll ?back\b")),
    ("stop", re.compile(r"(?i)\bstop\b|\bhalt\b|\bdon.?t do that\b")),
    ("redo", re.compile(r"(?i)\btry again\b|\bredo\b|\bretry\b")),
)


def _iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _median(values):
    return statistics.median(values) if values else 0.0


def _p95(values):
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, int(round(0.95 * (len(s) - 1))))
    return s[idx]


def rank(items, key, top_n, tiebreak, reverse=True):
    """Sort items by key (descending unless reverse=False), then by the
    stable tiebreaker, cap to top_n. Returns (top, droppedCount).
    """
    sign = -1 if reverse else 1
    ordered = sorted(items, key=lambda x: (sign * _num(key(x)), tiebreak(x)))
    return ordered[:top_n], max(0, len(ordered) - top_n)


def _num(v):
    return v if isinstance(v, (int, float)) and v == v else 0


# ---------------------------------------------------------------- window ---

def build_window(days, stats, sessions):
    by_kind = Counter(s["kind"] for s in sessions)
    return {
        "days": days,
        "fromIso": _iso(stats["fromTs"]),
        "toIso": _iso(stats["toTs"]),
        "filesScanned": stats["filesScanned"],
        "filesSkipped": stats["filesSkipped"],
        "sessionsByKind": {k: by_kind.get(k, 0) for k in ("main", "subagent", "workflow-agent")},
        "projectCount": len({s["proj"] for s in sessions}),
    }


# ---------------------------------------------------------------- tokens ---

def _price_model(model, counts, pricing):
    fam = cost_mod.family_for_model(model)
    rate = pricing[fam or "sonnet"]
    return cost_mod.price_tokens(counts, rate), fam is None


def build_tokens(sessions, stats, pricing, top_n):
    totals = {"in": 0, "out": 0, "cacheRead": 0, "cacheCreate": 0}
    by_kind = {k: {"in": 0, "out": 0, "cacheRead": 0, "cacheCreate": 0} for k in ("main", "subagent", "workflow-agent")}
    by_proj = defaultdict(lambda: {"in": 0, "out": 0, "cacheRead": 0, "cacheCreate": 0})

    for s in sessions:
        c = {"in": s.get("inTokens", 0), "out": s.get("outTokens", 0),
             "cacheRead": s.get("cacheReadTokens", 0), "cacheCreate": s.get("cacheCreateTokens", 0)}
        for k in totals:
            totals[k] += c[k]
        bk = by_kind[s["kind"]]
        for k in bk:
            bk[k] += c[k]
        bp = by_proj[s["proj"]]
        for k in bp:
            bp[k] += c[k]

    model_tokens = stats.get("modelTokens", {})
    by_model = {}
    unpriced = []
    total_cost = 0.0
    for model in sorted(model_tokens, key=lambda m: (-sum(model_tokens[m].values()), m)):
        counts = model_tokens[model]
        usd, is_unpriced = _price_model(model, counts, pricing)
        entry = dict(counts)
        entry["estCostUsd"] = round(usd, 4)
        by_model[model] = entry
        total_cost += usd
        if is_unpriced:
            unpriced.append(model)

    proj_rows = []
    for proj, c in by_proj.items():
        row = dict(c)
        row["proj"] = proj
        row["totalTokens"] = sum(c.values())
        proj_rows.append(row)
    ranked_proj, dropped_proj = rank(proj_rows, lambda r: r["totalTokens"], top_n, lambda r: r["proj"])

    return {
        "totals": totals,
        "byModel": by_model,
        "byKind": by_kind,
        "byProject": ranked_proj,
        "byProjectDroppedCount": dropped_proj,
        "estCostUsd": round(total_cost, 4),
        "pricing": pricing,
        "unpricedModels": sorted(set(unpriced)),
    }


# -------------------------------------------------------------- wallClock ---

def build_wall_clock(tool_rows, top_n):
    total_sec = sum(r.get("durSec") or 0 for r in tool_rows)
    by_tool = defaultdict(float)
    by_proj = defaultdict(float)
    for r in tool_rows:
        d = r.get("durSec") or 0
        by_tool[r["tool"]] += d
        by_proj[r.get("proj", "")] += d
    tool_rows_agg = [{"tool": t, "totalSec": round(s, 3)} for t, s in by_tool.items()]
    ranked_tool, _ = rank(tool_rows_agg, lambda r: r["totalSec"], top_n, lambda r: r["tool"])
    proj_rows_agg = [{"proj": p, "totalSec": round(s, 3)} for p, s in by_proj.items()]
    ranked_proj, dropped_proj = rank(proj_rows_agg, lambda r: r["totalSec"], top_n, lambda r: r["proj"])
    return {
        "totalToolSec": round(total_sec, 3),
        "byTool": ranked_tool,
        "byProject": ranked_proj,
        "byProjectDroppedCount": dropped_proj,
        "note": "durSec is approximate: it is result timestamp minus call timestamp and includes harness overhead.",
    }


# --------------------------------------------------------------- commands ---

def _family_stats(bash_rows):
    groups = defaultdict(list)
    for r in bash_rows:
        groups[(r.get("family", ""), r.get("bin", ""))].append(r)
    rows = []
    for (family, binname), items in groups.items():
        durs = [r.get("durSec") for r in items if r.get("durSec") is not None]
        err_count = sum(1 for r in items if r.get("err"))
        rows.append({
            "family": family, "bin": binname, "count": len(items),
            "totalSec": round(sum(durs), 3), "medianSec": round(_median(durs), 3),
            "p95Sec": round(_p95(durs), 3),
            "errRate": round(err_count / len(items), 4) if items else 0.0,
        })
    return rows


def _repeats_in_session(bash_rows, top_n):
    groups = defaultdict(list)
    for r in bash_rows:
        groups[(r["sid"], r.get("proj", ""), r.get("cmd", ""))].append(r)
    rows = []
    for (sid, proj, cmd), items in groups.items():
        if len(items) < 2:
            continue
        ordered = sorted(items, key=lambda r: r.get("t") or 0)
        wasted = sum((r.get("durSec") or 0) for r in ordered[1:])
        rows.append({"sid": sid, "proj": proj, "cmd": cmd[:200], "occurrences": len(items), "wastedSec": round(wasted, 3)})
    return rank(rows, lambda r: r["wastedSec"], top_n, lambda r: (r["sid"], r["cmd"]))


def _flag_flailing(bash_rows, top_n):
    groups = defaultdict(list)
    for r in bash_rows:
        if r.get("t") is None:
            continue
        groups[(r["sid"], r.get("proj", ""), r.get("bin", ""))].append(r)
    rows = []
    for (sid, proj, binname), items in groups.items():
        items = sorted(items, key=lambda r: r["t"])
        n = len(items)
        max_distinct = 0
        for i in range(n):
            distinct = set()
            j = i
            while j < n and items[j]["t"] - items[i]["t"] <= _FLAG_FLAIL_WINDOW_SEC:
                distinct.add(items[j].get("family", ""))
                j += 1
            max_distinct = max(max_distinct, len(distinct))
        if max_distinct >= 4:
            total_sec = sum(r.get("durSec") or 0 for r in items)
            rows.append({"sid": sid, "proj": proj, "bin": binname, "distinctCommands": max_distinct,
                         "occurrences": n, "totalSec": round(total_sec, 3)})
    return rank(rows, lambda r: r["totalSec"], top_n, lambda r: (r["sid"], r["bin"]))


def build_commands(bash_rows, top_n):
    family_rows = _family_stats(bash_rows)
    by_total, dropped_total = rank(family_rows, lambda r: r["totalSec"], top_n, lambda r: (r["family"], r["bin"]))
    by_count, dropped_count = rank(family_rows, lambda r: r["count"], top_n, lambda r: (r["family"], r["bin"]))
    repeats, dropped_repeats = _repeats_in_session(bash_rows, top_n)
    flailing, dropped_flailing = _flag_flailing(bash_rows, top_n)
    return {
        "familiesByTotalSec": by_total, "familiesByTotalSecDroppedCount": dropped_total,
        "familiesByCount": by_count, "familiesByCountDroppedCount": dropped_count,
        "repeatsInSession": repeats, "repeatsInSessionDroppedCount": dropped_repeats,
        "flagFlailing": flailing, "flagFlailingDroppedCount": dropped_flailing,
    }


# ----------------------------------------------------------------- errors ---

def _error_clusters(error_rows, top_n):
    groups = defaultdict(list)
    for r in error_rows:
        groups[r.get("sig", "")].append(r)
    rows = []
    for sig, items in groups.items():
        tool_counts = Counter(r.get("tool") for r in items if r.get("tool"))
        row = {
            "sig": sig, "count": len(items), "sessionCount": len({r["sid"] for r in items}),
            "projects": sorted({r["proj"] for r in items}), "sampleMsg": items[0].get("msg", ""),
        }
        if tool_counts:
            row["topTool"] = tool_counts.most_common(1)[0][0]
        rows.append(row)
    return rank(rows, lambda r: r["count"], top_n, lambda r: r["sig"])


def _missing_binaries(bash_rows, top_n):
    groups = defaultdict(list)
    for r in bash_rows:
        if r.get("err") and any(m in r.get("out", "") for m in _MISSING_BIN_MARKERS):
            groups[r.get("bin", "")].append(r)
    rows = [{"bin": b, "count": len(items), "sample": items[0].get("cmd", "")[:200]} for b, items in groups.items()]
    return rank(rows, lambda r: r["count"], top_n, lambda r: r["bin"])


def _permission_denied(bash_rows, top_n):
    groups = defaultdict(list)
    for r in bash_rows:
        if r.get("err") and any(m in r.get("out", "") for m in _PERMISSION_MARKERS):
            groups[r.get("family", "")].append(r)
    rows = [{"family": f, "count": len(items), "sample": items[0].get("cmd", "")[:200]} for f, items in groups.items()]
    return rank(rows, lambda r: r["count"], top_n, lambda r: r["family"])


def _retry_loops(bash_rows, top_n):
    by_sid = defaultdict(list)
    for r in bash_rows:
        if r.get("t") is not None:
            by_sid[r["sid"]].append(r)
    episodes = defaultdict(list)
    for items in by_sid.values():
        items = sorted(items, key=lambda r: r["t"])
        n = len(items)
        i = 0
        while i < n:
            if items[i].get("err"):
                family = items[i].get("family", "")
                t0 = items[i]["t"]
                retries = 0
                j = i + 1
                while j < n and items[j]["t"] - t0 <= _RETRY_LOOP_WINDOW_SEC:
                    if items[j].get("family") == family:
                        retries += 1
                    j += 1
                if retries > 0:
                    episodes[family].append(retries)
            i += 1
    rows = [{"family": f, "count": len(v), "medianRetries": round(_median(v), 2)} for f, v in episodes.items()]
    return rank(rows, lambda r: r["count"], top_n, lambda r: r["family"])


def build_errors(bash_rows, error_rows, top_n):
    clusters, dropped_clusters = _error_clusters(error_rows, top_n)
    missing, dropped_missing = _missing_binaries(bash_rows, top_n)
    denied, dropped_denied = _permission_denied(bash_rows, top_n)
    retries, dropped_retries = _retry_loops(bash_rows, top_n)
    return {
        "clusters": clusters, "clustersDroppedCount": dropped_clusters,
        "missingBinaries": missing, "missingBinariesDroppedCount": dropped_missing,
        "permissionDenied": denied, "permissionDeniedDroppedCount": dropped_denied,
        "retryLoops": retries, "retryLoopsDroppedCount": dropped_retries,
    }


# ----------------------------------------------------------------- context ---

def build_context(sessions, tool_rows, top_n):
    session_rows = [{"sid": s["sid"], "proj": s["proj"], "kind": s["kind"], "maxCtx": s.get("maxCtx", 0)} for s in sessions]
    top_sessions, dropped_sessions = rank(session_rows, lambda r: r["maxCtx"], top_n, lambda r: r["sid"])

    big_rows = []
    by_tool_chars = defaultdict(list)
    for r in tool_rows:
        chars = r.get("outChars", 0)
        by_tool_chars[r["tool"]].append(chars)
        row = {"sid": r["sid"], "proj": r["proj"], "tool": r["tool"], "outChars": chars}
        if r.get("arg"):
            row["arg"] = r["arg"]
        big_rows.append(row)
    big_outputs, dropped_big = rank(big_rows, lambda r: r["outChars"], top_n, lambda r: (r["sid"], r["tool"]))
    p95_per_tool = {t: round(_p95(v), 1) for t, v in by_tool_chars.items()}
    p95_per_tool = dict(sorted(p95_per_tool.items(), key=lambda kv: (-kv[1], kv[0])))

    read_groups = defaultdict(list)
    for r in tool_rows:
        if r.get("tool") == "Read" and r.get("arg"):
            read_groups[(r["sid"], r.get("proj", ""), r["arg"])].append(r)
    re_read_rows = []
    for (sid, proj, arg), items in read_groups.items():
        if len(items) < 2:
            continue
        ordered = sorted(items, key=lambda r: r.get("t") or 0)
        wasted_chars = sum(r.get("outChars", 0) for r in ordered[1:])
        re_read_rows.append({"sid": sid, "proj": proj, "arg": arg, "occurrences": len(items),
                             "wastedTokensEst": round(wasted_chars / 4)})
    re_reads, dropped_re_reads = rank(re_read_rows, lambda r: r["wastedTokensEst"], top_n, lambda r: (r["sid"], r["arg"]))

    cache_acc = defaultdict(lambda: {"cacheRead": 0, "cacheCreate": 0})
    for s in sessions:
        a = cache_acc[s["kind"]]
        a["cacheRead"] += s.get("cacheReadTokens", 0)
        a["cacheCreate"] += s.get("cacheCreateTokens", 0)
    cache_write_ratio = {}
    for kind in ("main", "subagent", "workflow-agent"):
        a = cache_acc.get(kind, {"cacheRead": 0, "cacheCreate": 0})
        denom = a["cacheRead"] + a["cacheCreate"]
        cache_write_ratio[kind] = round(a["cacheCreate"] / denom, 4) if denom else 0.0

    return {
        "topSessions": top_sessions, "topSessionsDroppedCount": dropped_sessions,
        "bigOutputs": big_outputs, "bigOutputsDroppedCount": dropped_big, "bigOutputsP95PerTool": p95_per_tool,
        "reReads": re_reads, "reReadsDroppedCount": dropped_re_reads,
        "cacheWriteRatio": cache_write_ratio,
    }


# --------------------------------------------------------------------- web ---

def build_web(tool_rows, sessions, top_n):
    web_rows = [r for r in tool_rows if r.get("tool") in ("WebFetch", "WebSearch")]
    counts = dict(Counter(r["tool"] for r in web_rows))
    total_sec = round(sum(r.get("durSec") or 0 for r in web_rows), 3)
    total_chars = sum(r.get("outChars", 0) for r in web_rows)
    sid_to_run = {s["sid"]: s.get("run") for s in sessions}

    groups = defaultdict(list)
    for r in web_rows:
        if r.get("arg"):
            groups[(r["tool"], r["arg"])].append(r)
    repeat_rows = []
    for (tool, key), items in groups.items():
        if len(items) < 2:
            continue
        runs = {sid_to_run.get(r["sid"]) for r in items}
        cross_run = not (len(runs) == 1 and next(iter(runs)) is not None)
        repeat_rows.append({"tool": tool, "key": key[:300], "count": len(items),
                            "chars": sum(r.get("outChars", 0) for r in items), "crossRun": cross_run})
    repeats, dropped_repeats = rank(repeat_rows, lambda r: r["count"], top_n, lambda r: (r["tool"], r["key"]))

    run_counts = Counter(sid_to_run.get(r["sid"]) for r in web_rows if sid_to_run.get(r["sid"]))
    conc_rows = [{"run": run, "count": c} for run, c in run_counts.items()]
    concentration, dropped_conc = rank(conc_rows, lambda r: r["count"], top_n, lambda r: r["run"])

    return {
        "counts": counts, "totalSec": total_sec, "totalChars": total_chars,
        "repeats": repeats, "repeatsDroppedCount": dropped_repeats,
        "concentrationByRun": concentration, "concentrationByRunDroppedCount": dropped_conc,
    }


# ------------------------------------------------------------------ fanout ---

def build_fanout(sessions, pricing, top_n):
    groups = defaultdict(list)
    for s in sessions:
        if s.get("run"):
            groups[s["run"]].append(s)
    run_rows = []
    for run, items in groups.items():
        tokens_total = sum(s.get("inTokens", 0) + s.get("outTokens", 0) + s.get("cacheReadTokens", 0) + s.get("cacheCreateTokens", 0) for s in items)
        cost_total = 0.0
        for s in items:
            model = next(iter(s.get("models") or {}), None)
            counts = {"in": s.get("inTokens", 0), "out": s.get("outTokens", 0),
                      "cacheRead": s.get("cacheReadTokens", 0), "cacheCreate": s.get("cacheCreateTokens", 0)}
            usd, _ = _price_model(model, counts, pricing)
            cost_total += usd
        fturns = [s.get("firstTurnCacheCreate", 0) for s in items]
        run_rows.append({"run": run, "agents": len(items), "tokens": tokens_total,
                         "estCostUsd": round(cost_total, 4), "medianFirstTurnCacheCreate": round(_median(fturns), 1)})
    by_cost, dropped_cost = rank(run_rows, lambda r: r["estCostUsd"], top_n, lambda r: r["run"])

    agent_rows = [s for s in sessions if s.get("run")]
    ratios = []
    for s in agent_rows:
        cr = s.get("cacheReadTokens", 0)
        ratios.append(s.get("outTokens", 0) / cr if cr else 0.0)
    low_yield = []
    dropped_low = 0
    if ratios:
        threshold = sorted(ratios)[max(0, int(0.10 * (len(ratios) - 1)))]
        candidates = []
        for s, ratio in zip(agent_rows, ratios):
            if ratio <= threshold:
                candidates.append({"sid": s["sid"], "run": s.get("run"), "outTokens": s.get("outTokens", 0),
                                   "cacheReadTokens": s.get("cacheReadTokens", 0), "ratio": round(ratio, 6)})
        low_yield, dropped_low = rank(candidates, lambda r: r["ratio"], top_n, lambda r: r["sid"], reverse=False)

    return {
        "byRun": by_cost, "byRunDroppedCount": dropped_cost,
        "lowYield": low_yield, "lowYieldDroppedCount": dropped_low,
    }


# ------------------------------------------------------------------- human ---

def _corrections(user_msgs):
    human_rows = sorted((r for r in user_msgs if r.get("human")), key=lambda r: (r["sid"], r.get("t") or 0))
    results = []
    for name, pat in _CORRECTION_BUCKETS:
        matches = [r for r in human_rows if pat.search(r["text"])]
        results.append({"bucket": name, "count": len(matches), "samples": [m["text"][:200] for m in matches[:3]]})
    results.sort(key=lambda r: (-r["count"], r["bucket"]))
    return results


def _normalize_request(text):
    t = re.sub(r"\s+", " ", text.strip().lower())
    return re.sub(r"[^a-z0-9 ]", "", t)[:100]


def _repeated_requests(user_msgs, top_n):
    groups = defaultdict(list)
    for r in user_msgs:
        if not r.get("human"):
            continue
        key = _normalize_request(r["text"])
        if len(key) < 10:
            continue
        groups[key].append(r)
    rows = []
    for key, items in groups.items():
        sids = sorted({r["sid"] for r in items})
        if len(sids) < 2:
            continue
        rows.append({"clusterKey": key, "count": len(items), "sids": sids})
    return rank(rows, lambda r: r["count"], top_n, lambda r: r["clusterKey"])


def build_human(sessions, user_msgs, top_n):
    human_count = sum(1 for r in user_msgs if r.get("human"))
    interrupts = sum(s.get("interrupts", 0) for s in sessions)
    repeated, dropped_repeated = _repeated_requests(user_msgs, top_n)
    return {
        "humanTurnCount": human_count,
        "interrupts": interrupts,
        "corrections": _corrections(user_msgs),
        "repeatedRequests": repeated, "repeatedRequestsDroppedCount": dropped_repeated,
    }


# ---------------------------------------------------------------- projects ---

def _on_disk_info(cwd):
    info = {"claudeMd": False, "agentsMd": False, "claudeSettings": False, "packageJson": None}
    if not cwd:
        return info
    base = Path(cwd)
    info["claudeMd"] = (base / "CLAUDE.md").exists()
    info["agentsMd"] = (base / "AGENTS.md").exists()
    info["claudeSettings"] = (base / ".claude" / "settings.json").exists()
    pkg_path = base / "package.json"
    if pkg_path.exists():
        try:
            with open(pkg_path, "r", encoding="utf-8") as fh:
                pkg = json.load(fh)
            info["packageJson"] = {
                "packageManager": pkg.get("packageManager"),
                "scripts": sorted((pkg.get("scripts") or {}).keys()),
            }
        except (OSError, ValueError):
            info["packageJson"] = {"packageManager": None, "scripts": []}
    return info


def build_projects(sessions, bash_rows, top_commands=5):
    by_proj = defaultdict(list)
    for s in sessions:
        by_proj[s["proj"]].append(s)
    bash_by_proj = defaultdict(list)
    for r in bash_rows:
        bash_by_proj[r.get("proj", "")].append(r)

    rows = []
    for proj, items in by_proj.items():
        tokens = sum(s.get("inTokens", 0) + s.get("outTokens", 0) + s.get("cacheReadTokens", 0) + s.get("cacheCreateTokens", 0) for s in items)
        bash_items = bash_by_proj.get(proj, [])
        bash_sec = round(sum(r.get("durSec") or 0 for r in bash_items), 3)
        fam_counts = Counter(r.get("family", "") for r in bash_items)
        top_cmds = [f for f, _ in sorted(fam_counts.items(), key=lambda kv: (-kv[1], kv[0]))[:top_commands]]
        cwd = next((s.get("cwd") for s in items if s.get("cwd")), None)
        rows.append({"proj": proj, "cwd": cwd, "sessions": len(items), "tokens": tokens,
                     "bashSec": bash_sec, "topCommands": top_cmds, "onDisk": _on_disk_info(cwd)})
    rows.sort(key=lambda r: (-r["tokens"], r["proj"]))
    return rows


# ----------------------------------------------------------------- master ---

def build(sessions, tools, bash_rows, user_msgs, errors, stats, days, pricing, top_n):
    """Build the full aggregate dict (all sections, no schemaVersion wrapper)."""
    return {
        "window": build_window(days, stats, sessions),
        "tokens": build_tokens(sessions, stats, pricing, top_n),
        "wallClock": build_wall_clock(tools, top_n),
        "commands": build_commands(bash_rows, top_n),
        "errors": build_errors(bash_rows, errors, top_n),
        "context": build_context(sessions, tools, top_n),
        "web": build_web(tools, sessions, top_n),
        "fanout": build_fanout(sessions, pricing, top_n),
        "human": build_human(sessions, user_msgs, top_n),
        "projects": build_projects(sessions, bash_rows, min(5, top_n)),
    }
