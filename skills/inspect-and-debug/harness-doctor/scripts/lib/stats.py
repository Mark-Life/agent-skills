"""Deterministic numeric, grouping, and ranking helpers.

The Python twin of `lib/stats.ts`, function for function, including its
rounding and percentile rules: the two runtimes must produce the same numbers
from the same fact tables, not merely similar ones.
"""

import math
import re
from datetime import datetime, timezone

_WS = re.compile(r"\s+")


def num(value):
    """A finite number, or 0 for None, NaN, infinity, and non-numbers."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    return value if math.isfinite(value) else 0


def round_to(value, digits=2):
    """Round half up, like JS `Math.round(n * p) / p`, and drop a trailing .0.

    Python's built-in round is half-to-even, so `round(0.5)` is 0 there and 1 in
    JavaScript. Integral results come back as ints so the JSON reads `12`, not
    `12.0`.
    """
    n = num(value)
    p = 10 ** digits
    scaled = math.floor(n * p + 0.5) if n >= 0 else -math.floor(-n * p + 0.5)
    out = scaled / p
    return int(out) if out == int(out) else out


def safe_div(a, b):
    """Divide, returning 0 when the denominator is 0 or not finite."""
    b = num(b)
    return 0 if b == 0 else num(a) / b


def percentile(values, p):
    """Nearest-rank percentile of an unsorted numeric list. 0 when empty."""
    if not values:
        return 0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, math.ceil(p * len(ordered)) - 1))
    return ordered[idx]


def median(values):
    """Median of an unsorted numeric list. 0 when empty."""
    if not values:
        return 0
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def total(items, f):
    """Sum a numeric field over items. 0 for an empty list."""
    return sum(num(f(x)) for x in items)


def group_by(items, key):
    """Group items into a dict keyed by a string, first-seen order preserved."""
    out = {}
    for item in items:
        out.setdefault(key(item), []).append(item)
    return out


def bump(counts, key, by=1):
    """Increment a counter in a dict."""
    counts[key] = counts.get(key, 0) + by


def uniq_sorted(values):
    """Sorted unique strings."""
    return sorted(set(values))


def top_key(counts):
    """Key with the highest count; ties break on the smallest key."""
    best = ""
    best_n = -1
    for key in sorted(counts):
        n = counts.get(key, 0)
        if n > best_n:
            best = key
            best_n = n
    return best


def sorted_record(entries):
    """Build a dict with keys inserted in sorted order, so JSON is stable."""
    return {k: v for k, v in sorted(entries, key=lambda kv: kv[0])}


def cap_ranking(rows, top):
    """Wrap an already-ordered list in the Ranking shape without re-sorting."""
    cap = max(0, int(top))
    kept = list(rows)[:cap]
    return {"rows": kept, "shown": len(kept), "total": len(rows), "dropped": max(0, len(rows) - len(kept))}


def ranking(rows, metric, tiebreak, top):
    """Sort by metric descending, break ties on tiebreak ascending, then cap."""
    ordered = sorted(rows, key=lambda r: (-num(metric(r)), tiebreak(r)))
    return cap_ranking(ordered, top)


def iso_of(epoch_sec):
    """Epoch seconds as `2026-08-07T14:36:38.000Z`, matching JS toISOString."""
    if epoch_sec is None or not math.isfinite(epoch_sec) or epoch_sec <= 0:
        return ""
    dt = datetime.fromtimestamp(round(epoch_sec), tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def collapse_ws(s):
    """Collapse whitespace runs to single spaces and trim."""
    return _WS.sub(" ", s or "").strip()


def clip(s, max_chars):
    """Cap a string, marking the cut with a single ellipsis char."""
    s = s or ""
    return (s[:max_chars] + "…") if len(s) > max_chars else s


def by_time(rows):
    """Rows with a `t`, sorted ascending. Rows without one are dropped."""
    timed = [r for r in rows if isinstance(r.get("t"), (int, float))]
    return sorted(timed, key=lambda r: r["t"])
