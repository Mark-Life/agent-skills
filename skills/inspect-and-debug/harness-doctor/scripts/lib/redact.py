"""Best-effort secret redaction for text pulled out of transcripts.

The Python twin of `lib/redact.ts`, rule for rule and in the same order.
Precision beats recall: the entropy fallbacks fire only next to a credential
keyword, so commit hashes, UUIDs, and ordinary paths survive intact. Applied to
UserMsgRow.text, ErrorRow.input, ErrorRow.msg, BashRow.cmd and BashRow.out
unless --no-redact.
"""

import math
import re
from collections import Counter

# The one replacement string. The TypeScript twin and the tests match on this.
REDACTED = "[REDACTED]"

_PLACEHOLDER = re.compile(
    r"^(?:null|none|true|false|undefined|changeme|change-me|example|examples?|sample"
    r"|placeholder|redacted|dummy|fixme|todo|foo|bar|baz|value|your[-_a-z0-9]*"
    r"|my[-_a-z0-9]*|test|xxx+|\*+|<[^>]+>|\$\{?[A-Za-z0-9_]+\}?"
    r"|process\.env(?:\.[A-Z_]+)?|os\.environ.*)$",
    re.I,
)
_DIGITS_ONLY = re.compile(r"^\d+$")
_BLOB_MAGIC = re.compile(r"^(?:iVBORw0KGgo|/9j/|JVBERi0|UEsDB|R0lGOD|UklGR|H4sI|AAAA|data:)")
_CRED_CONTEXT = re.compile(
    r"(?:secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|password|passwd"
    r"|\bpwd\b|credential|client[_-]?secret|signing|webhook|\bauth|bearer)",
    re.I,
)
_SENSITIVE_SEGMENT = re.compile(
    r"^(?:KEY|KEYS|TOKEN|TOKENS|SECRET|SECRETS|PASSWORD|PASSWD|PWD|PASS|CRED|CREDS"
    r"|CREDENTIAL|CREDENTIALS|APIKEY|PASSPHRASE|SIGNINGKEY)$"
)
_DESCRIPTIVE_KEY = re.compile(
    r"(?:VERSION|URL|URI|HOST|PORT|PATH|DIR|NAME|ENABLED|DISABLED|MODE|ENV|REGION|BASE"
    r"|ENDPOINT|PROVIDER|TYPE|PUBLIC|TIMEOUT|COUNT|LEVEL|FORMAT|PREFIX|SUFFIX)$"
)
_QUOTES = re.compile(r"^[\"']|[\"']$")


def _entropy(s):
    """Shannon entropy in bits per character."""
    if not s:
        return 0.0
    freq = Counter(s)
    return -sum((n / len(s)) * math.log2(n / len(s)) for n in freq.values())


def _is_placeholder(v):
    """True for values that look like indirections or dummies, not real secrets."""
    return bool(_PLACEHOLDER.match(v)) or bool(_DIGITS_ONLY.match(v)) or v.startswith("[REDACTED")


def _cred_context_at(m):
    """True when a credential keyword sits in the ~48 chars before the match."""
    start = m.start()
    return bool(_CRED_CONTEXT.search(m.string[max(0, start - 48):start]))


def _fixed(_m):
    return REDACTED


def _keep_group1(m):
    return m.group(1) + REDACTED


def _url_creds(m):
    return "%s://%s:%s@" % (m.group(1), m.group(2), REDACTED)


def _quoted_aws(m):
    return m.group(1) + REDACTED + m.group(3) if _entropy(m.group(2)) >= 4.0 else m.group(0)


def _kv_assignment(m):
    value = _QUOTES.sub("", m.group(3))
    return m.group(0) if _is_placeholder(value) else m.group(1) + m.group(2) + REDACTED


def _env_line(m):
    """KEY=value shell/.env line: only the value token goes, never the command."""
    pre, key, sep, val, rest = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
    sensitive = any(_SENSITIVE_SEGMENT.match(part) for part in key.split("_"))
    if not sensitive or _DESCRIPTIVE_KEY.search(key):
        return m.group(0)
    if _is_placeholder(_QUOTES.sub("", val)):
        return m.group(0)
    return pre + key + sep + REDACTED + rest


def _base64_run(m):
    """Long base64url run, only next to a credential keyword and high entropy."""
    hit = m.group(0)
    if len(hit) > 512 or _BLOB_MAGIC.match(hit):
        return hit
    if not re.search(r"[0-9]", hit) or not re.search(r"[A-Za-z]", hit):
        return hit
    if _is_placeholder(hit) or not _cred_context_at(m):
        return hit
    return REDACTED if _entropy(hit) >= 3.5 else hit


def _hex_run(m):
    """Long hex run, only next to a credential keyword and high entropy."""
    hit = m.group(0)
    if not re.search(r"[a-fA-F]", hit) or not re.search(r"[0-9]", hit):
        return hit
    if not _cred_context_at(m):
        return hit
    return REDACTED if _entropy(hit) >= 3.0 else hit


# Rules ordered specific -> generic. Provider-prefixed tokens win first; the
# entropy fallbacks run last.
_RULES = (
    (re.compile(
        r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?"
        r"-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----"), _fixed),
    (re.compile(r"sk-ant-[A-Za-z0-9_-]{40,}"), _fixed),
    (re.compile(r"\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}"), _fixed),
    (re.compile(r"\b(?:gh[opusr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b"), _fixed),
    (re.compile(r"\bglpat-[A-Za-z0-9_-]{20}\b"), _fixed),
    (re.compile(r"\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ABIA|ACCA)[A-Z0-9]{16}\b"), _fixed),
    (re.compile(r"\bAIza[A-Za-z0-9_-]{35}\b"), _fixed),
    (re.compile(r"\bya29\.[A-Za-z0-9_-]{20,}"), _fixed),
    (re.compile(r"\bxox[baprse]-[A-Za-z0-9-]{10,48}\b"), _fixed),
    (re.compile(r"\bxapp-[0-9]-[A-Za-z0-9-]{10,}\b"), _fixed),
    (re.compile(r"https://hooks\.slack\.com/services/T[A-Za-z0-9]+/B[A-Za-z0-9]+/[A-Za-z0-9]{24}"), _fixed),
    (re.compile(r"\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,99}\b"), _fixed),
    (re.compile(r"\bwhsec_[A-Za-z0-9]{20,}\b"), _fixed),
    (re.compile(r"\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b"), _fixed),
    (re.compile(r"\bnpm_[A-Za-z0-9]{36}\b"), _fixed),
    (re.compile(r"\bdop_v1_[a-f0-9]{64}\b"), _fixed),
    (re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"), _fixed),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*\b"), _fixed),
    (re.compile(r"\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}={0,2}"), _keep_group1),
    (re.compile(r"(Authorization\"?\s*:\s*\"?)(?:Basic|Token)\s+[A-Za-z0-9+/._-]{8,}={0,2}", re.I), _keep_group1),
    (re.compile(r"\b(https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?|ftp)://([^:@/\s]+):[^@/\s]+@", re.I), _url_creds),
    (re.compile(r"((?:aws|secret|access)[^\n]{0,40}?[\"'])([A-Za-z0-9/+=]{40})([\"'])", re.I), _quoted_aws),
    (re.compile(
        r"(password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|client[_-]?secret"
        r"|auth[_-]?token|token)(\s*[:=]\s*)(\"[^\"\n]*\"|'[^'\n]*'|[^\s\"']{6,})", re.I), _kv_assignment),
    (re.compile(r"^([ \t]*(?:export[ \t]+)?)([A-Z][A-Z0-9_]*)([ \t]*=[ \t]*)(\"[^\"]*\"|'[^']*'|\S+)(.*)$", re.M), _env_line),
    (re.compile(r"[A-Za-z0-9_-]{32,}={0,2}"), _base64_run),
    (re.compile(r"\b[0-9a-fA-F]{32,}\b"), _hex_run),
)


def redact_text(text, enabled=True):
    """Replace secret-shaped substrings with [REDACTED]. No-op when disabled."""
    if not enabled or not text:
        return text
    out = text
    for pattern, repl in _RULES:
        out = pattern.sub(repl, out)
    return out
