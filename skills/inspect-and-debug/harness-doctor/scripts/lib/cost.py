"""Per-model pricing and cost estimation. All costs are estimates."""

import json

# Rates in USD per million tokens, snapshot 2026-08-10. Check
# https://www.anthropic.com/pricing for current rates before trusting these.
DEFAULT_PRICING = {
    "opus": {"input": 15, "output": 75, "cacheWrite": 18.75, "cacheRead": 1.50},
    "sonnet": {"input": 3, "output": 15, "cacheWrite": 3.75, "cacheRead": 0.30},
    "haiku": {"input": 1, "output": 5, "cacheWrite": 1.25, "cacheRead": 0.10},
}

_FAMILIES = ("opus", "sonnet", "haiku")


def family_for_model(model_id: str):
    """Match a model id to a pricing family by substring. None if unmatched."""
    m = (model_id or "").lower()
    for fam in _FAMILIES:
        if fam in m:
            return fam
    return None


def load_pricing(path):
    """Load the default pricing table, optionally overridden by a JSON file
    at path. Returns (pricing, overridden).
    """
    if not path:
        return DEFAULT_PRICING, False
    with open(path, "r", encoding="utf-8") as fh:
        override = json.load(fh)
    merged = {**DEFAULT_PRICING, **override}
    return merged, True


def price_tokens(counts, pricing) -> float:
    """Estimate USD cost for a {in, out, cacheRead, cacheCreate} token count
    dict against a pricing-family rate dict.
    """
    inp = counts.get("in", 0) * pricing["input"]
    out = counts.get("out", 0) * pricing["output"]
    cr = counts.get("cacheRead", 0) * pricing["cacheRead"]
    cc = counts.get("cacheCreate", 0) * pricing["cacheWrite"]
    return (inp + out + cr + cc) / 1_000_000
