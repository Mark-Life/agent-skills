"""Best-effort secret redaction for text fields written to the fact tables.

Applied by default to UserMsgRow.text, ErrorRow.input, ErrorRow.msg,
BashRow.cmd and BashRow.out. Disabled with --no-redact. This is best-effort:
it catches common key shapes, not every possible secret.
"""

import re

_PEM = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S)
_AUTH_HEADER = re.compile(r"(?i)(authorization\s*:\s*)(\S.*)")
_KEY_ASSIGNMENT = re.compile(
    r"(?i)\b([A-Za-z_][A-Za-z0-9_]*(?:token|secret|password|key)[A-Za-z0-9_]*)\s*=\s*(\S+)"
)
_SK_KEY = re.compile(r"\bsk-[A-Za-z0-9_-]{10,}\b")
_GHP_KEY = re.compile(r"\bghp_[A-Za-z0-9]{20,}\b")
_AKIA_KEY = re.compile(r"\bAKIA[0-9A-Z]{12,}\b")
_HEX_RUN = re.compile(r"\b[0-9a-fA-F]{32,}\b")
_BASE64_RUN = re.compile(r"\b[A-Za-z0-9+/]{40,}={0,2}\b")


def redact_text(text: str, enabled: bool = True) -> str:
    """Replace secret-shaped substrings in text with [REDACTED].

    No-op when enabled is False or text is falsy.
    """
    if not enabled or not text:
        return text
    out = _PEM.sub("[REDACTED]", text)
    out = _AUTH_HEADER.sub(lambda m: m.group(1) + "[REDACTED]", out)
    out = _KEY_ASSIGNMENT.sub(lambda m: m.group(1) + "=[REDACTED]", out)
    out = _SK_KEY.sub("[REDACTED]", out)
    out = _GHP_KEY.sub("[REDACTED]", out)
    out = _AKIA_KEY.sub("[REDACTED]", out)
    out = _HEX_RUN.sub("[REDACTED]", out)
    out = _BASE64_RUN.sub("[REDACTED]", out)
    return out
