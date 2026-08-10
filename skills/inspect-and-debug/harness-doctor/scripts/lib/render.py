"""Render the aggregate report as JSON or compact markdown.

The Python twin of `lib/render.ts` and `lib/format.ts`: same sections, same
column headings, same row caps. Nothing here uses locale-aware formatting, so
the summary is byte-identical across machines.
"""

import json
import re
from decimal import Decimal, ROUND_HALF_UP

# Hard cap on rows per table, whatever --top says.
MAX_ROWS = 25

_KINDS = ("main", "subagent", "workflow-agent")
_NEWLINES = re.compile(r"\r?\n")
_BLANK_RUN = re.compile(r"\n{3,}")


def render_json(report):
    """The report as pretty JSON, `schemaVersion` first."""
    return json.dumps(report, indent=2, ensure_ascii=False)


def _fixed(n, digits):
    """Decimal string rounded half away from zero, the way JS toFixed rounds.

    Python's %-formatting rounds ties to even, so 1.25 would print 1.2 here and
    1.3 in the TypeScript twin.
    """
    q = Decimal(1).scaleb(-digits)
    return str(Decimal(n).quantize(q, rounding=ROUND_HALF_UP))


def _group(n):
    """Thousands separators, locale-independent."""
    return "{:,}".format(int(Decimal(n).quantize(Decimal(1), rounding=ROUND_HALF_UP)))


def _int(n):
    return _group(n)


def _tok(n):
    """Token count, compacted: 1234 -> 1.2k, 12345678 -> 12.35M."""
    a = abs(n)
    if a < 1000:
        return str(int(Decimal(n).quantize(Decimal(1), rounding=ROUND_HALF_UP)))
    if a < 1000000:
        return _fixed(n / 1000, 1) + "k"
    return _fixed(n / 1000000, 2) + "M"


def _sec(n):
    """Seconds, promoted to minutes or hours once the number stops being readable."""
    a = abs(n)
    if a < 90:
        return _fixed(n, 1) + "s"
    if a < 5400:
        return _fixed(n / 60, 1) + "m"
    return _fixed(n / 3600, 1) + "h"


def _usd(n):
    """USD. Always presented as an estimate by the surrounding text."""
    if abs(n) < 1:
        return "$" + _fixed(n, 4)
    whole, cents = _fixed(abs(n), 2).split(".")
    return "%s$%s.%s" % ("-" if n < 0 else "", _group(int(whole)), cents)


def _pct(frac):
    return _fixed(frac * 100, 1) + "%"


def _plural(n, word, many=None):
    many = many if many is not None else word + "s"
    return "%s %s" % (_int(n), word if int(Decimal(n).quantize(Decimal(1), rounding=ROUND_HALF_UP)) == 1 else many)


def _cell(value, max_chars=70):
    """Table cell: pipes escaped, newlines flattened, length capped."""
    s = _NEWLINES.sub(" ", str(value)).replace("|", "\\|").strip()
    return (s[:max_chars] + "…") if len(s) > max_chars else s


def _table(headers, rows):
    """A markdown table as lines, or a single "(none)" line when empty."""
    if not rows:
        return ["(none)"]
    return (
        ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
        + ["| " + " | ".join(_cell(v) for v in row) + " |" for row in rows]
    )


def _take(rank, limit):
    return rank["rows"][:limit]


def _dropped(rank, limit):
    """One line saying what a table left out, counting both caps."""
    shown = min(len(rank["rows"]), limit)
    hidden = rank["total"] - shown
    return ["%s of %s rows, %s not shown." % (_int(shown), _int(rank["total"]), _int(hidden))] if hidden > 0 else []


def _ranked(rank, limit, headers, row):
    return _table(headers, [row(x) for x in _take(rank, limit)]) + _dropped(rank, limit)


def _all_tokens(t):
    return t["in"] + t["out"] + t["cacheRead"] + t["cacheCreate"]


def _by_value(record, limit):
    """Record entries sorted by value descending, then key, capped."""
    return sorted(record.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]


def _headline(r):
    w = r["window"]
    kinds = ", ".join("%s %s" % (k, _int(w["sessionsByKind"].get(k, 0))) for k in _KINDS)
    flail = r["commands"]["flagFlailing"]
    retry = r["errors"]["retryLoops"]
    corrections = r["human"]["corrections"]
    correction_count = sum(b["count"] for b in corrections["rows"])
    repeats = r["commands"]["repeatsInSession"]
    return [
        "# harness audit",
        "",
        "Window %sd, %s to %s. Files scanned %s, skipped %s. Sessions: %s. Projects %s."
        % (w["days"], w["fromIso"] or "unknown", w["toIso"] or "unknown",
           _int(w["filesScanned"]), _int(w["filesSkipped"]), kinds, _int(w["projectCount"])),
        "",
        "## headline",
        "",
    ] + _table(["metric", "value"], [
        ["tokens total", _tok(_all_tokens(r["tokens"]["totals"]))],
        ["estimated cost", _usd(r["tokens"]["estCostUsd"])],
        ["tool wall-clock (approx)", _sec(r["wallClock"]["totalToolSec"])],
        ["bash seconds", _sec(next((t["totalSec"] for t in r["wallClock"]["byTool"]["rows"] if t["tool"] == "Bash"), 0))],
        ["commands re-run in-session",
         "%s over %s" % (_plural(sum(x["occurrences"] for x in repeats["rows"]), "repeat"),
                         _plural(repeats["total"], "command"))],
        ["flag flailing",
         "%s across %s" % (_plural(sum(x["occurrences"] for x in flail["rows"]), "distinct command"),
                           _plural(flail["total"], "bin"))],
        ["retry loops",
         "%s over %s" % (_plural(sum(x["count"] for x in retry["rows"]), "loop"),
                         _plural(retry["total"], "family", "families"))],
        ["web repeat rate", "%s of %s calls" % (_pct(r["web"]["repeatRate"]), _int(r["web"]["totalCalls"]))],
        ["fan-out prefix rewritten",
         "%s cacheWrite on first turns, %s agents" % (_tok(r["fanout"]["totalFirstTurnCacheCreate"]),
                                                      _int(r["fanout"]["agentsWithFirstTurnCacheWrite"]))],
        ["human corrections",
         "%s bucket hits over %s human turns" % (_int(correction_count), _int(r["human"]["humanTurnCount"]))],
        ["interrupts", _int(r["human"]["interrupts"])],
    ]) + [""]


def _tokens_block(r, limit):
    t = r["tokens"]
    unpriced = (
        ["Unpriced model ids, charged at sonnet rates: %s." % ", ".join(t["unpricedModels"])]
        if t["unpricedModels"] else ["Every model id matched a priced family."]
    )
    by_model = sorted(t["byModel"].items(), key=lambda kv: (-_all_tokens(kv[1]), kv[0]))[:limit]
    return (
        ["## tokens", "",
         "Totals: in %s, out %s, cacheRead %s, cacheWrite %s. Estimated cost %s."
         % (_tok(t["totals"]["in"]), _tok(t["totals"]["out"]), _tok(t["totals"]["cacheRead"]),
            _tok(t["totals"]["cacheCreate"]), _usd(t["estCostUsd"])), ""]
        + _table(["kind", "in", "out", "cacheRead", "cacheWrite"],
                 [[k, _tok(t["byKind"][k]["in"]), _tok(t["byKind"][k]["out"]),
                   _tok(t["byKind"][k]["cacheRead"]), _tok(t["byKind"][k]["cacheCreate"])]
                  for k in _KINDS if k in t["byKind"]])
        + ["", "By model, tokens attributed in proportion to model calls per session:", ""]
        + _table(["model", "in", "out", "cacheRead", "cacheWrite"],
                 [[m, _tok(v["in"]), _tok(v["out"]), _tok(v["cacheRead"]), _tok(v["cacheCreate"])]
                  for m, v in by_model])
        + [""]
        + _ranked(t["byProject"], limit, ["project", "sessions", "tokens", "cacheRead", "est cost"],
                  lambda p: [p["proj"], _int(p["sessions"]), _tok(_all_tokens(p["totals"])),
                             _tok(p["totals"]["cacheRead"]), _usd(p["estCostUsd"])])
        + [""] + unpriced + [t["note"], ""]
    )


def _wall_clock_block(r, limit):
    w = r["wallClock"]
    return (
        ["## wall clock", "", "Total tool time %s. %s" % (_sec(w["totalToolSec"]), w["note"]), ""]
        + _ranked(w["byTool"], limit, ["tool", "calls", "total", "median", "p95", "err"],
                  lambda x: [x["tool"], _int(x["calls"]), _sec(x["totalSec"]), _sec(x["medianSec"]),
                             _sec(x["p95Sec"]), _pct(x["errRate"])])
        + [""]
        + _ranked(w["byProject"], limit, ["project", "calls", "total"],
                  lambda x: [x["proj"], _int(x["calls"]), _sec(x["totalSec"])])
        + [""]
    )


def _commands_block(r, limit):
    c = r["commands"]
    return (
        ["## commands", ""]
        + _ranked(c["byTotalSec"], limit, ["family", "bin", "calls", "total", "median", "p95", "err"],
                  lambda x: [x["family"], x["bin"], _int(x["count"]), _sec(x["totalSec"]),
                             _sec(x["medianSec"]), _sec(x["p95Sec"]), _pct(x["errRate"])])
        + ["", "Most-run families:", ""]
        + _ranked(c["byCount"], limit, ["family", "calls", "total", "err"],
                  lambda x: [x["family"], _int(x["count"]), _sec(x["totalSec"]), _pct(x["errRate"])])
        + ["", "Identical command re-run inside one session, counting every run after the first:", ""]
        + _ranked(c["repeatsInSession"], limit, ["command", "repeats", "sessions", "wasted"],
                  lambda x: [x["cmd"], _int(x["occurrences"]), _int(x["sessions"]), _sec(x["wastedSec"])])
        + ["", "Flag flailing: same binary, 4 or more distinct normalised commands inside 10 minutes of one session.", ""]
        + _ranked(c["flagFlailing"], limit, ["bin", "distinct cmds", "sessions", "total", "sample"],
                  lambda x: [x["bin"], _int(x["occurrences"]), _int(x["sessions"]), _sec(x["totalSec"]),
                             " ; ".join(x["sampleCmds"][:2])])
        + [""]
    )


def _errors_block(r, limit):
    e = r["errors"]
    return (
        ["## errors", ""]
        + _ranked(e["clusters"], limit, ["signature", "count", "sessions", "top tool", "sample"],
                  lambda x: [x["sig"], _int(x["count"]), _int(x["sessionCount"]), x["topTool"], x["sampleMsg"]])
        + ["", "Binaries the shell could not find:", ""]
        + _ranked(e["missingBinaries"], limit, ["bin", "count", "sessions", "sample"],
                  lambda x: [x["bin"], _int(x["count"]), _int(x["sessions"]), x["sampleMsg"]])
        + ["", "Refused calls:", ""]
        + _ranked(e["permissionDenied"], limit, ["target", "count", "sessions", "sample"],
                  lambda x: [x["target"], _int(x["count"]), _int(x["sessions"]), x["sampleMsg"]])
        + ["", "Retry loops: a command re-run within 5 minutes of failing.", ""]
        + _ranked(e["retryLoops"], limit, ["family", "loops", "median retries", "sessions", "sample"],
                  lambda x: [x["family"], _int(x["count"]), _fixed(x["medianRetries"], 1),
                             _int(x["sessions"]), x["sampleCmd"]])
        + [""]
    )


def _context_block(r, limit):
    c = r["context"]
    shown = _take(c["topSessions"], limit)
    shown_read = sum(s["cacheReadTokens"] for s in shown)
    total_read = r["tokens"]["totals"]["cacheRead"]
    share = (shown_read / total_read) if total_read > 0 else 0
    return (
        ["## context", "",
         "The %d sessions with the largest peak context hold %s of all cache-read tokens (%s of %s)."
         % (len(shown), _pct(share), _tok(shown_read), _tok(total_read)), ""]
        + _ranked(c["topSessions"], limit, ["session", "project", "kind", "maxCtx", "cacheRead", "est cost"],
                  lambda x: [x["sid"][:8], x["proj"], x["kind"], _tok(x["maxCtx"]),
                             _tok(x["cacheReadTokens"]), _usd(x["estCostUsd"])])
        + ["", "Single tool results that returned the most text:", ""]
        + _ranked(c["bigOutputs"], limit, ["tool", "arg", "chars", "tokens est"],
                  lambda x: [x["tool"], x.get("arg", ""), _int(x["outChars"]), _tok(x["tokensEst"])])
        + [""]
        + _table(["tool", "p95 chars"], [[tool, _int(v)] for tool, v in _by_value(c["p95CharsByTool"], limit)])
        + ["", "Same file read more than once in one session:", ""]
        + _ranked(c["reReads"], limit, ["file", "extra reads", "sessions", "wasted tokens"],
                  lambda x: [x["arg"], _int(x["occurrences"]), _int(x["sessions"]), _tok(x["wastedTokensEst"])])
        + [""]
        + _table(["kind", "cacheWrite share"], [[k, _pct(c["cacheWriteRatio"].get(k, 0))] for k in _KINDS])
        + [""]
    )


def _web_block(r, limit):
    w = r["web"]
    return (
        ["## web", "",
         "%s calls, %s, %s tokens of text. %s of calls re-fetched a url or query already answered."
         % (_int(w["totalCalls"]), _sec(w["totalSec"]), _tok(w["totalChars"] / 4), _pct(w["repeatRate"])), ""]
        + _table(["tool", "calls", "sec", "chars"],
                 [[tool, _int(s["calls"]), _sec(s["sec"]), _int(s["chars"])] for tool, s in w["byTool"].items()])
        + [""]
        + _ranked(w["repeats"], limit, ["tool", "url or query", "fetches", "chars", "one run"],
                  lambda x: [x["tool"], x["arg"], _int(x["count"]), _int(x["chars"]),
                             "yes" if x["sameRun"] else "no"])
        + [""]
        + _ranked(w["byRun"], limit, ["run", "calls", "agents", "chars"],
                  lambda x: [x["run"], _int(x["calls"]), _int(x["agents"]), _int(x["chars"])])
        + [""]
    )


def _fanout_block(r, limit):
    f = r["fanout"]
    return (
        ["## fanout", "",
         "%s agents paid for a fresh prefix on their first turn, %s cacheWrite tokens in total."
         % (_int(f["agentsWithFirstTurnCacheWrite"]), _tok(f["totalFirstTurnCacheCreate"])), ""]
        + _ranked(f["runs"], limit,
                  ["run", "project", "agents", "tokens", "est cost", "median first-turn write"],
                  lambda x: [x["run"], x["proj"], _int(x["agents"]), _tok(_all_tokens(x["totals"])),
                             _usd(x["estCostUsd"]), _tok(x["medianFirstTurnCacheCreate"])])
        + ["", "Low-yield agents: bottom decile of output tokens per cache-read token.", ""]
        + _ranked(f["lowYield"], limit, ["agent", "run", "cacheRead", "out", "yield", "est cost"],
                  lambda x: [x["sid"][:8], x.get("run", ""), _tok(x["cacheReadTokens"]),
                             _tok(x["outTokens"]), _fixed(x["yield"], 4), _usd(x["estCostUsd"])])
        + [""]
    )


def _human_block(r, limit):
    h = r["human"]
    buckets = []
    for b in _take(h["corrections"], limit):
        buckets.append("- %s: %s" % (b["bucket"], _plural(b["count"], "turn")))
        buckets.extend('  - "%s"' % _cell(s, 200) for s in b["samples"])
    return (
        ["## human", "",
         "%s human turns, %s interrupts. Only turns flagged as real human input are scanned: "
         "harness echoes, fenced code, and quoted lines are excluded."
         % (_int(h["humanTurnCount"]), _int(h["interrupts"])), "",
         "Corrections by theme, a turn may match more than one theme:", ""]
        + (buckets or ["(none)"])
        + _dropped(h["corrections"], limit)
        + ["", "Near-duplicate requests the human made in more than one session:", ""]
        + _ranked(h["repeatedRequests"], limit, ["request", "turns", "sessions"],
                  lambda x: [_cell(x["label"], 90), _int(x["count"]), _int(x["sessions"])])
        + [""]
    )


def _projects_block(r, limit):
    def on_disk(p):
        marks = [
            "CLAUDE.md" if p["onDisk"]["claudeMd"] else "",
            "AGENTS.md" if p["onDisk"]["agentsMd"] else "",
            "settings.json" if p["onDisk"]["settingsJson"] else "",
        ]
        return " ".join(m for m in marks if m) or "none"

    return (
        ["## projects", ""]
        + _ranked(r["projects"], limit,
                  ["project", "sessions", "tokens", "est cost", "bash", "top commands", "on disk", "pkg"],
                  lambda p: [
                      p["proj"], _int(p["sessions"]), _tok(_all_tokens(p["totals"])),
                      _usd(p["estCostUsd"]), _sec(p["bashSec"]),
                      " ; ".join("%s x%d" % (c["family"], c["count"]) for c in p["topCommands"][:3]),
                      on_disk(p),
                      "%s: %s" % (p["onDisk"].get("packageManager", "-"),
                                  ",".join(p["onDisk"]["scriptNames"][:6]) or "-"),
                  ])
        + [""]
    )


def render_md(report, top=15, work_dir=None):
    """The whole report as markdown. Rows are capped again here, at 25 per table."""
    limit = max(1, min(MAX_ROWS, int(top)))
    lines = (
        _headline(report)
        + _tokens_block(report, limit)
        + _wall_clock_block(report, limit)
        + _commands_block(report, limit)
        + _errors_block(report, limit)
        + _context_block(report, limit)
        + _web_block(report, limit)
        + _fanout_block(report, limit)
        + _human_block(report, limit)
        + _projects_block(report, limit)
    )
    if work_dir:
        lines.append(work_dir)
    return _BLANK_RUN.sub("\n\n", "\n".join(lines)).rstrip() + "\n"
