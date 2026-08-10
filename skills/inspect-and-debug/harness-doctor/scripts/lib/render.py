"""Render the aggregate dict as JSON or compact markdown."""

import json


def render_json(agg) -> str:
    """schemaVersion:1 wrapper plus the aggregate sections, pretty-printed."""
    out = {"schemaVersion": 1, **agg}
    return json.dumps(out, indent=2, sort_keys=False)


def _n(v):
    if isinstance(v, float):
        return f"{v:,.3f}"
    return f"{v:,}"


def _usd(v):
    return f"${v:,.4f}"


def _table(headers, rows):
    if not rows:
        return "_none_\n"
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for row in rows:
        cells = [str(c) if c is not None else "" for c in row]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def _dropped_note(dropped):
    return f"\n_{dropped} more row(s) not shown (see fact tables)._\n" if dropped else ""


def _render_window(w):
    return (
        f"## Window\n\n"
        f"Days: {w['days']}. From {w['fromIso']} to {w['toIso']}.\n"
        f"Files scanned: {_n(w['filesScanned'])}. Files skipped: {_n(w['filesSkipped'])}. "
        f"Projects: {_n(w['projectCount'])}.\n"
        f"Sessions by kind: main {_n(w['sessionsByKind']['main'])}, "
        f"subagent {_n(w['sessionsByKind']['subagent'])}, "
        f"workflow-agent {_n(w['sessionsByKind']['workflow-agent'])}.\n"
    )


def _render_tokens(t, top_n):
    out = [f"## Tokens (est. cost is an estimate, top {top_n} shown per ranking)\n"]
    tot = t["totals"]
    out.append(
        f"Totals: in {_n(tot['in'])}, out {_n(tot['out'])}, cacheRead {_n(tot['cacheRead'])}, "
        f"cacheCreate {_n(tot['cacheCreate'])}. Estimated cost: {_usd(t['estCostUsd'])}.\n"
    )
    if t["unpricedModels"]:
        out.append(f"Unpriced models (priced as sonnet, check rates): {', '.join(t['unpricedModels'])}.\n")
    out.append("\nBy model:\n")
    rows = [(m, _n(v["in"]), _n(v["out"]), _n(v["cacheRead"]), _n(v["cacheCreate"]), _usd(v["estCostUsd"]))
            for m, v in t["byModel"].items()]
    out.append(_table(["model", "in", "out", "cacheRead", "cacheCreate", "estCostUsd"], rows))
    out.append("\nBy kind:\n")
    rows = [(k, _n(v["in"]), _n(v["out"]), _n(v["cacheRead"]), _n(v["cacheCreate"])) for k, v in t["byKind"].items()]
    out.append(_table(["kind", "in", "out", "cacheRead", "cacheCreate"], rows))
    out.append(f"\nTop projects by total tokens ({top_n} of {len(t['byProject']) + t['byProjectDroppedCount']}):\n")
    rows = [(p["proj"], _n(p["totalTokens"]), _n(p["cacheRead"]), _n(p["cacheCreate"])) for p in t["byProject"]]
    out.append(_table(["proj", "totalTokens", "cacheRead", "cacheCreate"], rows))
    out.append(_dropped_note(t["byProjectDroppedCount"]))
    return "\n".join(out)


def _render_wall_clock(w, top_n):
    out = [f"## Wall clock (top {top_n})\n"]
    out.append(f"Total tool time: {_n(w['totalToolSec'])}s. {w['note']}\n")
    out.append("\nBy tool:\n")
    out.append(_table(["tool", "totalSec"], [(r["tool"], _n(r["totalSec"])) for r in w["byTool"]]))
    out.append("\nBy project:\n")
    out.append(_table(["proj", "totalSec"], [(r["proj"], _n(r["totalSec"])) for r in w["byProject"]]))
    out.append(_dropped_note(w["byProjectDroppedCount"]))
    return "\n".join(out)


def _render_commands(c, top_n):
    out = [f"## Commands (top {top_n})\n"]
    out.append("\nFamilies by total time:\n")
    out.append(_table(
        ["family", "bin", "count", "totalSec", "medianSec", "p95Sec", "errRate"],
        [(r["family"], r["bin"], _n(r["count"]), _n(r["totalSec"]), _n(r["medianSec"]), _n(r["p95Sec"]), _n(r["errRate"]))
         for r in c["familiesByTotalSec"]],
    ))
    out.append(_dropped_note(c["familiesByTotalSecDroppedCount"]))
    out.append("\nFamilies by count:\n")
    out.append(_table(
        ["family", "bin", "count", "totalSec"],
        [(r["family"], r["bin"], _n(r["count"]), _n(r["totalSec"])) for r in c["familiesByCount"]],
    ))
    out.append(_dropped_note(c["familiesByCountDroppedCount"]))
    out.append("\nRepeated identical commands inside one session:\n")
    out.append(_table(
        ["sid", "cmd", "occurrences", "wastedSec"],
        [(r["sid"][:8], r["cmd"][:60], _n(r["occurrences"]), _n(r["wastedSec"])) for r in c["repeatsInSession"]],
    ))
    out.append(_dropped_note(c["repeatsInSessionDroppedCount"]))
    out.append("\nFlag flailing (>=4 distinct commands of the same binary within 10 minutes):\n")
    out.append(_table(
        ["sid", "bin", "distinctCommands", "occurrences", "totalSec"],
        [(r["sid"][:8], r["bin"], _n(r["distinctCommands"]), _n(r["occurrences"]), _n(r["totalSec"])) for r in c["flagFlailing"]],
    ))
    out.append(_dropped_note(c["flagFlailingDroppedCount"]))
    return "\n".join(out)


def _render_errors(e, top_n):
    out = [f"## Errors (top {top_n})\n"]
    out.append("\nClusters:\n")
    out.append(_table(
        ["sig", "count", "sessionCount", "topTool", "sampleMsg"],
        [(r["sig"][:60], _n(r["count"]), _n(r["sessionCount"]), r.get("topTool", ""), r["sampleMsg"][:80])
         for r in e["clusters"]],
    ))
    out.append(_dropped_note(e["clustersDroppedCount"]))
    out.append("\nMissing binaries:\n")
    out.append(_table(["bin", "count", "sample"], [(r["bin"], _n(r["count"]), r["sample"][:80]) for r in e["missingBinaries"]]))
    out.append("\nPermission denied:\n")
    out.append(_table(["family", "count", "sample"], [(r["family"], _n(r["count"]), r["sample"][:80]) for r in e["permissionDenied"]]))
    out.append("\nRetry loops (same command re-run within 5 minutes of an error):\n")
    out.append(_table(["family", "count", "medianRetries"], [(r["family"], _n(r["count"]), _n(r["medianRetries"])) for r in e["retryLoops"]]))
    return "\n".join(out)


def _render_context(c, top_n):
    out = [f"## Context (top {top_n})\n"]
    out.append("\nSessions by largest single-request context:\n")
    out.append(_table(["sid", "proj", "kind", "maxCtx"], [(r["sid"][:8], r["proj"][:40], r["kind"], _n(r["maxCtx"])) for r in c["topSessions"]]))
    out.append(_dropped_note(c["topSessionsDroppedCount"]))
    out.append("\nBiggest tool outputs:\n")
    out.append(_table(["sid", "tool", "arg", "outChars"], [(r["sid"][:8], r["tool"], (r.get("arg") or "")[:50], _n(r["outChars"])) for r in c["bigOutputs"]]))
    out.append(_dropped_note(c["bigOutputsDroppedCount"]))
    out.append("\np95 output chars per tool:\n")
    out.append(_table(["tool", "p95Chars"], [(t, _n(v)) for t, v in c["bigOutputsP95PerTool"].items()]))
    out.append("\nRe-reads of the same file in one session:\n")
    out.append(_table(["sid", "arg", "occurrences", "wastedTokensEst"], [(r["sid"][:8], r["arg"][:50], _n(r["occurrences"]), _n(r["wastedTokensEst"])) for r in c["reReads"]]))
    out.append(_dropped_note(c["reReadsDroppedCount"]))
    out.append("\nCache-write ratio by kind (cacheCreate / (cacheCreate + cacheRead)):\n")
    out.append(_table(["kind", "ratio"], [(k, _n(v)) for k, v in c["cacheWriteRatio"].items()]))
    return "\n".join(out)


def _render_web(w, top_n):
    out = [f"## Web (top {top_n})\n"]
    out.append(f"Counts: {w['counts']}. Total time: {_n(w['totalSec'])}s. Total chars: {_n(w['totalChars'])}.\n")
    out.append("\nRepeated fetches/searches:\n")
    out.append(_table(["tool", "key", "count", "chars", "crossRun"], [(r["tool"], r["key"][:60], _n(r["count"]), _n(r["chars"]), r["crossRun"]) for r in w["repeats"]]))
    out.append(_dropped_note(w["repeatsDroppedCount"]))
    out.append("\nConcentration by workflow run:\n")
    out.append(_table(["run", "count"], [(r["run"], _n(r["count"])) for r in w["concentrationByRun"]]))
    out.append(_dropped_note(w["concentrationByRunDroppedCount"]))
    return "\n".join(out)


def _render_fanout(f, top_n):
    out = [f"## Fan-out (top {top_n})\n"]
    out.append("\nWorkflow runs by estimated cost:\n")
    out.append(_table(
        ["run", "agents", "tokens", "estCostUsd", "medianFirstTurnCacheCreate"],
        [(r["run"], _n(r["agents"]), _n(r["tokens"]), _usd(r["estCostUsd"]), _n(r["medianFirstTurnCacheCreate"])) for r in f["byRun"]],
    ))
    out.append(_dropped_note(f["byRunDroppedCount"]))
    out.append("\nLow-yield agents (bottom decile outTokens/cacheReadTokens):\n")
    out.append(_table(["sid", "run", "outTokens", "cacheReadTokens", "ratio"], [(r["sid"][:8], r["run"], _n(r["outTokens"]), _n(r["cacheReadTokens"]), _n(r["ratio"])) for r in f["lowYield"]]))
    out.append(_dropped_note(f["lowYieldDroppedCount"]))
    return "\n".join(out)


def _render_human(h, top_n):
    out = [f"## Human (top {top_n})\n"]
    out.append(f"Human turns: {_n(h['humanTurnCount'])}. Interrupts: {_n(h['interrupts'])}.\n")
    out.append("\nCorrection signal buckets (a turn may match more than one bucket):\n")
    for b in h["corrections"]:
        out.append(f"- {b['bucket']}: {b['count']}")
        for s in b["samples"]:
            out.append(f"  - \"{s}\"")
    out.append("\n\nRepeated near-duplicate requests across sessions:\n")
    out.append(_table(["clusterKey", "count", "sids"], [(r["clusterKey"][:60], _n(r["count"]), ", ".join(s[:8] for s in r["sids"][:5])) for r in h["repeatedRequests"]]))
    out.append(_dropped_note(h["repeatedRequestsDroppedCount"]))
    return "\n".join(out)


def _render_projects(rows, top_n):
    out = [f"## Projects (top {top_n} of {len(rows)})\n"]
    shown = rows[:top_n]
    table_rows = []
    for r in shown:
        pkg = r["onDisk"]["packageJson"]
        pm = pkg["packageManager"] if pkg else ""
        table_rows.append((
            r["proj"][:40], _n(r["sessions"]), _n(r["tokens"]), _n(r["bashSec"]),
            ", ".join(r["topCommands"]), "CLAUDE.md" if r["onDisk"]["claudeMd"] else "",
            "AGENTS.md" if r["onDisk"]["agentsMd"] else "", pm or "",
        ))
    out.append(_table(["proj", "sessions", "tokens", "bashSec", "topCommands", "claudeMd", "agentsMd", "pkgManager"], table_rows))
    if len(rows) > top_n:
        out.append(_dropped_note(len(rows) - top_n))
    return "\n".join(out)


def render_md(agg, top_n) -> str:
    """Compact markdown report body. Caller appends the work dir path as the
    final stdout line separately (see CLI contract).
    """
    parts = [
        "# harness-doctor audit\n",
        _render_window(agg["window"]),
        _render_tokens(agg["tokens"], top_n),
        _render_wall_clock(agg["wallClock"], top_n),
        _render_commands(agg["commands"], top_n),
        _render_errors(agg["errors"], top_n),
        _render_context(agg["context"], top_n),
        _render_web(agg["web"], top_n),
        _render_fanout(agg["fanout"], top_n),
        _render_human(agg["human"], top_n),
        _render_projects(agg["projects"], top_n),
    ]
    return "\n\n".join(parts)
