/** Best-effort secret redaction for memory-derived text before it is embedded in the HTML report or findings.json. */
import type { AnalyzedVault } from "./types.ts";

/** Shannon entropy (bits/char) over a string's own characters. */
const entropy = (s: string): number => {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
};

/** Env-var refs, booleans, and obvious dummy/example values that must never be redacted. */
const PLACEHOLDER =
  /^(?:null|none|true|false|undefined|changeme|change-me|example|examples?|sample|placeholder|redacted|dummy|fixme|todo|foo|bar|baz|value|your[-_a-z0-9]*|my[-_a-z0-9]*|test|xxx+|\*+|<[^>]+>|\$\{?[A-Za-z0-9_]+\}?|process\.env(?:\.[A-Z_]+)?|os\.environ.*)$/i;

/** True for values that look like indirections/dummies rather than real secrets. */
const isPlaceholder = (v: string): boolean =>
  PLACEHOLDER.test(v) || /^\d+$/.test(v) || v.startsWith("[REDACTED");

/** base64 payload magic prefixes / data-URIs — skip these as binary blobs, not secrets. */
const BLOB_MAGIC = /^(?:iVBORw0KGgo|\/9j\/|JVBERi0|UEsDB|R0lGOD|UklGR|H4sI|AAAA|data:)/;

/** Credential-context keywords used to gate the entropy fallbacks (precision over recall). */
const CRED_CONTEXT =
  /(?:secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|password|passwd|\bpwd\b|credential|client[_-]?secret|signing|webhook|\bauth|bearer)/i;

/**
 * True when a credential keyword appears in the ~48 chars immediately before a
 * fallback match. `rest` is the trailing replacer args `[...groups, offset, string]`.
 */
const credContextAt = (rest: unknown[]): boolean => {
  const str = rest[rest.length - 1];
  const offset = rest[rest.length - 2];
  if (typeof str !== "string" || typeof offset !== "number") return false;
  return CRED_CONTEXT.test(str.slice(Math.max(0, offset - 48), offset));
};

/**
 * A redaction rule. `to` is either a static replacement string (supporting $1..$n)
 * or a function replacer used when context-sensitive guards are needed.
 */
interface Rule {
  re: RegExp;
  to: string | ((match: string, ...rest: string[]) => string);
}

/**
 * High-precision rules, ordered specific -> generic. Provider-prefixed tokens win
 * first; the entropy fallbacks run last and ONLY near a credential keyword, so
 * checksums, lockfile hashes, UUIDs, and data-URIs are left intact.
 */
const RULES: Rule[] = [
  // Private-key blocks (covers RSA/EC/DSA/OPENSSH/PGP/ENCRYPTED and bare PRIVATE KEY).
  {
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
    to: "[REDACTED:private-key-block]",
  },
  { re: /sk-ant-[A-Za-z0-9_-]{40,}/g, to: "[REDACTED:anthropic-key]" },
  { re: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, to: "[REDACTED:openai-key]" },
  { re: /\b(?:gh[opusr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g, to: "[REDACTED:github-token]" },
  { re: /\bglpat-[A-Za-z0-9_-]{20}\b/g, to: "[REDACTED:gitlab-token]" },
  { re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ABIA|ACCA)[A-Z0-9]{16}\b/g, to: "[REDACTED:aws-access-key-id]" },
  { re: /\bAIza[A-Za-z0-9_-]{35}\b/g, to: "[REDACTED:google-api-key]" },
  { re: /\bya29\.[A-Za-z0-9_-]{20,}/g, to: "[REDACTED:google-oauth-token]" },
  { re: /\bxox[baprse]-[A-Za-z0-9-]{10,48}\b/g, to: "[REDACTED:slack-token]" },
  { re: /\bxapp-[0-9]-[A-Za-z0-9-]{10,}\b/g, to: "[REDACTED:slack-token]" },
  {
    re: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]{24}/g,
    to: "[REDACTED:slack-webhook]",
  },
  { re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,99}\b/g, to: "[REDACTED:stripe-key]" },
  { re: /\bwhsec_[A-Za-z0-9]{20,}\b/g, to: "[REDACTED:stripe-webhook-secret]" },
  { re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, to: "[REDACTED:sendgrid-key]" },
  { re: /\bnpm_[A-Za-z0-9]{36}\b/g, to: "[REDACTED:npm-token]" },
  { re: /\bdop_v1_[a-f0-9]{64}\b/g, to: "[REDACTED:digitalocean-token]" },
  { re: /\bhf_[A-Za-z0-9]{30,}\b/g, to: "[REDACTED:huggingface-token]" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*\b/g, to: "[REDACTED:jwt]" },
  // Bearer token (handles header and JSON-serialized "Authorization": "Bearer ..." forms).
  {
    re: /\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}={0,2}/g,
    to: "$1[REDACTED:bearer-token]",
  },
  {
    re: /(Authorization"?\s*:\s*"?Basic\s+)[A-Za-z0-9+/]{16,}={0,2}/gi,
    to: "$1[REDACTED:basic-credentials]",
  },
  // Connection strings / URLs with inline user:password@ credentials (incl. http(s) basic-auth).
  {
    re: /\b(https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?|ftp):\/\/([^:@/\s]+):[^@/\s]+@/gi,
    to: "$1://$2:[REDACTED]@",
  },
  // Contextual AWS secret: keyword + quoted 40-char base64, entropy-gated.
  {
    re: /((?:aws|secret|access)[^\n]{0,40}?["'])([A-Za-z0-9/+=]{40})(["'])/gi,
    to: (m, g1, g2, g3) => (entropy(g2) >= 4.0 ? `${g1}[REDACTED:aws-secret-key]${g3}` : m),
  },
  // Contextual Twilio SID/key: only when a 'twilio' keyword appears in the text.
  {
    re: /\b(?:AC|SK)[0-9a-f]{32}\b/g,
    to: (m, ...rest) => {
      const src = rest[rest.length - 1];
      return typeof src === "string" && /twilio/i.test(src) ? "[REDACTED:twilio-id]" : m;
    },
  },
  // Generic key=value / key: value credential assignment, placeholder-guarded.
  {
    re: /(password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|client[_-]?secret|auth[_-]?token|token)(\s*[:=]\s*)["']?([^\s"']{6,})["']?/gi,
    to: (m, g1, g2, g3) => (isPlaceholder(g3) ? m : `${g1}${g2}[REDACTED:credential]`),
  },
  // .env / shell-export lines whose KEY has a sensitive underscore-delimited segment.
  {
    re: /^[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]*)([ \t]*=[ \t]*)(.+)$/gm,
    to: (m, key: string, sep: string, val: string) => {
      const segs = key.split("_");
      const sensitive = segs.some((s) =>
        /^(?:KEY|KEYS|TOKEN|TOKENS|SECRET|SECRETS|PASSWORD|PASSWD|PWD|PASS|CRED|CREDS|CREDENTIAL|CREDENTIALS|APIKEY|PRIVATE|PASSPHRASE|SIGNINGKEY)$/.test(s),
      );
      const descriptive = /(?:VERSION|URL|URI|HOST|PORT|PATH|DIR|NAME|ENABLED|DISABLED|MODE|ENV|REGION|BASE|ENDPOINT|PROVIDER|TYPE|PUBLIC|TIMEOUT|COUNT|LEVEL|FORMAT|PREFIX|SUFFIX)$/.test(key);
      if (!sensitive || descriptive) return m;
      return isPlaceholder(val.replace(/^["']|["']$/g, "")) ? m : `${key}${sep}[REDACTED:env-secret]`;
    },
  },
  // Entropy fallback (base64url): only near a credential keyword; skips blobs/placeholders.
  {
    re: /[A-Za-z0-9_-]{32,}={0,2}/g,
    to: (m, ...rest) => {
      if (m.length > 512 || BLOB_MAGIC.test(m)) return m;
      if (!/[0-9]/.test(m) || !/[A-Za-z]/.test(m)) return m;
      if (isPlaceholder(m) || !credContextAt(rest)) return m;
      return entropy(m) >= 3.5 ? "[REDACTED:high-entropy]" : m;
    },
  },
  // Entropy fallback (hex): only near a credential keyword (standalone hashes/SHAs survive).
  {
    re: /\b[0-9a-fA-F]{32,}\b/g,
    to: (m, ...rest) => {
      if (!/[a-fA-F]/.test(m) || !/[0-9]/.test(m)) return m;
      if (!credContextAt(rest)) return m;
      return entropy(m) >= 3.0 ? "[REDACTED:high-entropy-hex]" : m;
    },
  },
];

/**
 * Redact secret-looking substrings from a single string, best-effort.
 * Specific labeled rules run first and win; the entropy fallbacks run last and
 * only fire adjacent to a credential keyword. All regexes are linear-time.
 */
export const redactText = (s: string): string => {
  if (!s) return s;
  let out = s;
  for (const { re, to } of RULES) {
    out = typeof to === "string" ? out.replace(re, to) : out.replace(re, to);
  }
  return out;
};

/**
 * Rewrite every untrusted, memory-derived string field on the analyzed vault in place:
 * file bodies, descriptions, index hooks, finding messages/evidence, and candidate
 * evidence. Mutates and returns the same object for chaining. Numeric fields, hashes,
 * slugs, and paths are left untouched (they are not free-text secret carriers).
 * Sets `redacted = true`.
 */
export const redactVault = (a: AnalyzedVault): AnalyzedVault => {
  for (const f of a.files) {
    f.body = redactText(f.body);
    if (f.frontmatter.description) f.frontmatter.description = redactText(f.frontmatter.description);
  }
  if (a.index) {
    for (const e of a.index.entries) {
      if (e.hook) e.hook = redactText(e.hook);
      if (e.label) e.label = redactText(e.label);
    }
  }
  for (const fnd of a.findings) {
    fnd.message = redactText(fnd.message);
    if (fnd.evidence) fnd.evidence = redactText(fnd.evidence);
  }
  for (const c of a.candidates) {
    if (c.evidence) c.evidence = redactText(c.evidence);
    if (c.note) c.note = redactText(c.note);
  }
  a.redacted = true;
  return a;
};
