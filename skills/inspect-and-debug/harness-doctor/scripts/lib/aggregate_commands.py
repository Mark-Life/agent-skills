"""The `commands` and `errors` sections of the audit.

The Python twin of `lib/aggregate-commands.ts`. These two carry most of the
diagnostic value: `flagFlailing` and `retryLoops` are what catch an agent
groping for the right invocation, so the windowing is spelled out rather than
approximated.
"""

import re

from .stats import (
    bump, by_time, clip, collapse_ws, group_by, median, percentile,
    ranking, round_to, safe_div, top_key, total, uniq_sorted,
)

# Seconds a burst of same-bin commands may span and still count as one flail.
_FLAIL_WINDOW_SEC = 600

# Distinct normalised commands inside one window that make it a flail.
_FLAIL_MIN_DISTINCT = 4

# Seconds after a failure inside which a re-run counts as a retry.
_RETRY_WINDOW_SEC = 300


def _sec_of(row):
    """Duration of a bash call, 0 when the transcript had no result time."""
    return row.get("durSec") or 0


def _cmd_key(cmd):
    """Comparable form of a command: whitespace collapsed, nothing else changed."""
    return collapse_ws(cmd)


def _family_row(family, rows):
    """Roll a set of bash rows sharing a family into one ranked row."""
    secs = [_sec_of(r) for r in rows]
    bins = {}
    for row in rows:
        bump(bins, row.get("bin", ""))
    return {
        "family": family,
        "bin": top_key(bins),
        "count": len(rows),
        "totalSec": round_to(total(secs), 1),
        "medianSec": round_to(median(secs), 2),
        "p95Sec": round_to(percentile(secs, 0.95), 2),
        "errRate": round_to(safe_div(len([r for r in rows if r.get("err")]), len(rows)), 4),
    }


def command_families(bash):
    """Command families ranked rows, reused per project by the projects section."""
    grouped = group_by(bash, lambda r: r.get("family", ""))
    rows = [_family_row(family, items) for family, items in grouped.items()]
    return sorted(rows, key=lambda r: r["family"])


def _repeat_rows(bash, top):
    """Identical command re-run inside one session: everything after the first."""
    per_cmd = {}
    for _, rows in group_by(bash, lambda r: "%s %s" % (r["sid"], _cmd_key(r.get("cmd", "")))).items():
        if len(rows) < 2:
            continue
        ordered = sorted(rows, key=lambda r: r.get("t") or 0)
        first = ordered[0]
        key = _cmd_key(first.get("cmd", ""))
        entry = per_cmd.setdefault(key, {
            "family": first.get("family", ""), "cmd": clip(key, 200),
            "occurrences": 0, "sessions": set(), "wastedSec": 0,
        })
        entry["occurrences"] += len(ordered) - 1
        entry["sessions"].add(first["sid"])
        entry["wastedSec"] += total(ordered[1:], _sec_of)
    rows = [{
        "family": e["family"], "cmd": e["cmd"], "occurrences": e["occurrences"],
        "sessions": len(e["sessions"]), "wastedSec": round_to(e["wastedSec"], 1),
    } for e in per_cmd.values()]
    return ranking(rows, lambda r: r["occurrences"], lambda r: r["cmd"], top)


def _bursts_of(rows):
    """Split time-ordered rows into bursts opened by the first row outside the window."""
    out = []
    current = None
    opened_at = 0
    for row in rows:
        t = row.get("t") or 0
        if current is None or t - opened_at > _FLAIL_WINDOW_SEC:
            current = {"rows": [], "families": set()}
            opened_at = t
            out.append(current)
        current["rows"].append(row)
        current["families"].add(row.get("family", ""))
    return out


def _flailing_rows(bash, top):
    """Same bin, four or more distinct commands inside ten minutes of one session."""
    per_bin = {}
    for key, rows in group_by(bash, lambda r: "%s %s" % (r["sid"], r.get("bin", ""))).items():
        sid, _, binname = key.partition(" ")
        for burst in _bursts_of(by_time(rows)):
            if len(burst["families"]) < _FLAIL_MIN_DISTINCT:
                continue
            entry = per_bin.setdefault(binname, {
                "sessions": set(), "occurrences": 0, "totalSec": 0, "cmds": set(),
            })
            entry["sessions"].add(sid)
            entry["occurrences"] += len(burst["families"])
            entry["totalSec"] += total(burst["rows"], _sec_of)
            for row in burst["rows"]:
                entry["cmds"].add(clip(_cmd_key(row.get("cmd", "")), 160))
    rows = [{
        "bin": binname, "sessions": len(e["sessions"]), "occurrences": e["occurrences"],
        "totalSec": round_to(e["totalSec"], 1), "sampleCmds": uniq_sorted(e["cmds"])[:4],
    } for binname, e in per_bin.items()]
    return ranking(rows, lambda r: r["occurrences"], lambda r: r["bin"], top)


def commands_section(bash, top):
    """Bash cost, ranked and diagnosed."""
    families = command_families(bash)
    return {
        "byTotalSec": ranking(families, lambda r: r["totalSec"], lambda r: r["family"], top),
        "byCount": ranking(families, lambda r: r["count"], lambda r: r["family"], top),
        "repeatsInSession": _repeat_rows(bash, top),
        "flagFlailing": _flailing_rows(bash, top),
    }


# Patterns that name a binary the shell could not find, most specific first.
_MISSING_BIN_PATTERNS = (
    re.compile(r"command not found:\s*([A-Za-z0-9_.+-]+)"),
    re.compile(r"([A-Za-z0-9_.+-]+):\s*command not found"),
    re.compile(r"'([^']+)' is not recognized as an internal or external command"),
    re.compile(r"spawn\s+([A-Za-z0-9_.+\-/\\]+)\s+ENOENT"),
    re.compile(r"ENOENT[^\n]*?['\"]([^'\"]+)['\"]"),
    re.compile(r"([A-Za-z0-9_.+-]+):\s*not found"),
    re.compile(r"No such file or directory:\s*['\"]?([A-Za-z0-9_.+\-/\\]+)"),
)

# Patterns that name what a refused call was refused on, path first.
_DENIED_TARGET_PATTERNS = (
    re.compile(r"(?:EACCES|EPERM)[^\n]*?['\"]([^'\"]+)['\"]"),
    re.compile(r"[Pp]ermission denied[^\n]*?['\"]([^'\"]+)['\"]"),
    re.compile(r"([^\s:'\"]+):\s*[Pp]ermission denied"),
)

# Errno tokens that must never be reported as the thing a call was denied on.
_ERRNO_TOKENS = frozenset(["EACCES", "EPERM", "ENOENT", "EISDIR", "EROFS"])

_DENIED = re.compile(
    r"permission denied|EACCES|EPERM|operation not permitted|not permitted to|requires approval",
    re.I,
)


def _first_capture(msg, patterns):
    """First capture from the first matching pattern, skipping errno tokens."""
    for pattern in patterns:
        m = pattern.search(msg or "")
        hit = m.group(1).strip() if m and m.group(1) else None
        if hit and hit not in _ERRNO_TOKENS:
            return hit
    return None


def _observations_of(errors, bash):
    """Errors and failed bash output as one list, without counting a failure twice.

    A failed Bash call already appears in the errors table, so bash output is
    only used when that table carries no Bash rows at all.
    """
    rows = [{"sid": e["sid"], "tool": e.get("tool", "unknown"), "msg": e.get("msg", "")} for e in errors]
    if any(e.get("tool") == "Bash" for e in errors):
        return rows
    for b in bash:
        if b.get("err") and b.get("out"):
            rows.append({"sid": b["sid"], "tool": "Bash", "msg": b["out"]})
    return rows


def _shortest(values):
    """Shortest string, ties alphabetical, so samples never vary between runs."""
    ordered = sorted(values, key=lambda v: (len(v), v))
    return ordered[0] if ordered else ""


def _target_rows(observations, extract):
    """Group observations by an extracted target into count/sessions/sample rows."""
    per = {}
    for obs in observations:
        target = extract(obs)
        if not target:
            continue
        entry = per.setdefault(target, {"count": 0, "sessions": set(), "msgs": []})
        entry["count"] += 1
        entry["sessions"].add(obs["sid"])
        entry["msgs"].append(collapse_ws(obs["msg"]))
    return [{
        "target": target, "count": e["count"], "sessions": len(e["sessions"]),
        "sampleMsg": clip(_shortest(e["msgs"]), 200),
    } for target, e in per.items()]


def _cluster_rows(errors, top):
    """Errors sharing a normalised signature, ranked by how often they fired."""
    rows = []
    for sig, group in group_by(errors, lambda e: e.get("sig", "")).items():
        tools = {}
        for e in group:
            bump(tools, e.get("tool", "unknown"))
        rows.append({
            "sig": clip(sig, 200),
            "count": len(group),
            "sessionCount": len({e["sid"] for e in group}),
            "projects": uniq_sorted(e["proj"] for e in group)[:5],
            "sampleMsg": clip(_shortest([collapse_ws(e.get("msg", "")) for e in group]), 240),
            "topTool": top_key(tools),
        })
    return ranking(rows, lambda r: r["count"], lambda r: r["sig"], top)


def _retry_rows(bash, top):
    """A command re-run within five minutes of failing, reported per family."""
    per_family = {}
    for _, rows in group_by(bash, lambda r: r["sid"]).items():
        ordered = by_time(rows)
        consumed = set()
        for i, start in enumerate(ordered):
            if i in consumed or not start.get("err"):
                continue
            key = _cmd_key(start.get("cmd", ""))
            last_t = start.get("t") or 0
            retries = 0
            for j in range(i + 1, len(ordered)):
                nxt = ordered[j]
                if (nxt.get("t") or 0) - last_t > _RETRY_WINDOW_SEC:
                    break
                if j in consumed or _cmd_key(nxt.get("cmd", "")) != key:
                    continue
                consumed.add(j)
                retries += 1
                last_t = nxt.get("t") or last_t
            if retries == 0:
                continue
            entry = per_family.setdefault(start.get("family", ""), {
                "retries": [], "sessions": set(), "cmds": [],
            })
            entry["retries"].append(retries)
            entry["sessions"].add(start["sid"])
            entry["cmds"].append(clip(key, 200))
    rows = [{
        "family": family, "count": len(e["retries"]),
        "medianRetries": round_to(median(e["retries"]), 2),
        "sessions": len(e["sessions"]), "sampleCmd": _shortest(e["cmds"]),
    } for family, e in per_family.items()]
    return ranking(rows, lambda r: r["count"], lambda r: r["family"], top)


def errors_section(errors, bash, top):
    """Signature clusters, missing binaries, refused calls, and retry loops."""
    observations = _observations_of(errors, bash)
    missing = [
        {"bin": r.pop("target"), **r}
        for r in _target_rows(observations, lambda o: _first_capture(o["msg"], _MISSING_BIN_PATTERNS))
    ]
    denied = _target_rows(
        observations,
        lambda o: (_first_capture(o["msg"], _DENIED_TARGET_PATTERNS) or o["tool"])
        if _DENIED.search(o["msg"] or "") else None,
    )
    return {
        "clusters": _cluster_rows(errors, top),
        "missingBinaries": ranking(missing, lambda r: r["count"], lambda r: r["bin"], top),
        "permissionDenied": ranking(denied, lambda r: r["count"], lambda r: r["target"], top),
        "retryLoops": _retry_rows(bash, top),
    }
