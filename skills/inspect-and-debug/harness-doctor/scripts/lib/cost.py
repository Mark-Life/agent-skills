"""Per-model price table and cost maths. Every number here is an ESTIMATE.

The Python twin of `lib/cost.ts`: same rates, same matching order (exact table
key, then a family substring, then the sonnet fallback marked unpriced), same
note. Rates are published list prices in USD per million tokens as of
2026-08-10; check https://claude.com/pricing before quoting one.
"""

import json

# Built-in rates: USD per million tokens. Estimates, see the file header.
DEFAULT_PRICING = {
    "opus": {"input": 15, "output": 75, "cacheWrite": 18.75, "cacheRead": 1.5},
    "sonnet": {"input": 3, "output": 15, "cacheWrite": 3.75, "cacheRead": 0.3},
    "haiku": {"input": 1, "output": 5, "cacheWrite": 1.25, "cacheRead": 0.1},
}

# Family names tried as substrings of a model id.
_FAMILIES = ("opus", "sonnet", "haiku")

# Family used when a model id matches nothing. Such ids are reported separately.
FALLBACK_FAMILY = "sonnet"

# Provenance line for the rates, echoed into `tokens.note`.
PRICING_NOTE = (
    "Estimated cost. Rates are published list prices per million tokens, checked "
    "2026-08-10 at https://claude.com/pricing: no batch discount, no long-context "
    "tier, no account terms. Cache reads and cache writes are priced separately "
    "from input. Override with --pricing."
)

_RATE_KEYS = ("input", "output", "cacheWrite", "cacheRead")
_ZERO_RATES = {"input": 0, "output": 0, "cacheWrite": 0, "cacheRead": 0}


def price_for(model_id, pricing=None):
    """Match a model id to its rates.

    Exact table key first (so a --pricing file can name one model), then a family
    substring, then the sonnet fallback with priced False.
    """
    pricing = DEFAULT_PRICING if pricing is None else pricing
    mid = (model_id or "").strip().lower()
    if mid:
        for key in sorted(pricing):
            if key.lower() == mid:
                return {"family": key, "rates": pricing[key], "priced": True}
        for family in _FAMILIES:
            if family in mid:
                rates = pricing.get(family) or DEFAULT_PRICING[family]
                return {"family": family, "rates": rates, "priced": True}
    fallback = pricing.get(FALLBACK_FAMILY) or DEFAULT_PRICING[FALLBACK_FAMILY] or _ZERO_RATES
    return {"family": FALLBACK_FAMILY, "rates": fallback, "priced": False}


def family_for_model(model_id):
    """Pricing family of a model id, or None when it matches nothing."""
    mid = (model_id or "").lower()
    for family in _FAMILIES:
        if family in mid:
            return family
    return None


def estimate_cost(usage, pricing=None):
    """Estimated USD for one {in, out, cacheRead, cacheCreate, model} block."""
    rates = price_for(usage.get("model", ""), pricing)["rates"]
    per_token = 1e-6
    return (
        usage.get("in", 0) * rates["input"] * per_token
        + usage.get("out", 0) * rates["output"] * per_token
        + usage.get("cacheRead", 0) * rates["cacheRead"] * per_token
        + usage.get("cacheCreate", 0) * rates["cacheWrite"] * per_token
    )


def _as_rates(value):
    """Narrow a value to a complete rate card, or None."""
    if not isinstance(value, dict):
        return None
    out = {}
    for key in _RATE_KEYS:
        n = value.get(key)
        if isinstance(n, bool) or not isinstance(n, (int, float)) or n < 0:
            return None
        out[key] = n
    return out


def load_pricing(path):
    """Load the price table, merging a --pricing JSON file over the built-ins.

    Returns (pricing, overridden). Raises ValueError naming the path when the
    file is not an object of complete rate cards.
    """
    if not path:
        return dict(DEFAULT_PRICING), False
    with open(path, "r", encoding="utf-8") as fh:
        parsed = json.load(fh)
    if not isinstance(parsed, dict):
        raise ValueError("--pricing: %s must be a JSON object of rate cards" % path)
    merged = dict(DEFAULT_PRICING)
    bad = []
    for key in sorted(parsed):
        rates = _as_rates(parsed[key])
        if rates:
            merged[key] = rates
        else:
            bad.append(key)
    if bad:
        raise ValueError(
            "--pricing: %s entries need numeric input, output, cacheWrite, cacheRead: %s"
            % (path, ", ".join(bad))
        )
    return merged, True
