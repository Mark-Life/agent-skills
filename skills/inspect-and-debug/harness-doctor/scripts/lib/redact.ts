/**
 * Best-effort secret redaction for text pulled out of transcripts.
 *
 * The fact tables land on disk and carry real prompts, commands, and error
 * output, so redaction is ON by default and `--no-redact` turns it off. Every
 * match is replaced with the literal string `[REDACTED]`. Precision beats
 * recall here: the entropy fallbacks only fire next to a credential keyword, so
 * checksums, lockfile hashes, and UUIDs survive intact.
 */

/** The one replacement string. Tests and the Python mirror match on this. */
export const REDACTED = "[REDACTED]";

/** Shannon entropy in bits per character. */
const entropy = (s: string) => {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
};

/** Env-var refs, booleans, and obvious dummies that must never be redacted. */
const PLACEHOLDER =
  /^(?:null|none|true|false|undefined|changeme|change-me|example|examples?|sample|placeholder|redacted|dummy|fixme|todo|foo|bar|baz|value|your[-_a-z0-9]*|my[-_a-z0-9]*|test|xxx+|\*+|<[^>]+>|\$\{?[A-Za-z0-9_]+\}?|process\.env(?:\.[A-Z_]+)?|os\.environ.*)$/i;

/** True for values that look like indirections or dummies, not real secrets. */
const isPlaceholder = (v: string) =>
  PLACEHOLDER.test(v) || /^\d+$/.test(v) || v.startsWith("[REDACTED");

/** base64 payload prefixes and data URIs: binary blobs, not secrets. */
const BLOB_MAGIC = /^(?:iVBORw0KGgo|\/9j\/|JVBERi0|UEsDB|R0lGOD|UklGR|H4sI|AAAA|data:)/;

/** Credential keywords that gate the entropy fallbacks. */
const CRED_CONTEXT =
  /(?:secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|password|passwd|\bpwd\b|credential|client[_-]?secret|signing|webhook|\bauth|bearer)/i;

/**
 * True when a credential keyword sits in the ~48 chars before a match.
 * `rest` is the trailing replacer args `[...groups, offset, wholeString]`.
 */
const credContextAt = (rest: unknown[]) => {
  const src = rest[rest.length - 1];
  const offset = rest[rest.length - 2];
  if (typeof src !== "string" || typeof offset !== "number") return false;
  return CRED_CONTEXT.test(src.slice(Math.max(0, offset - 48), offset));
};

/** A redaction rule: a pattern and either a fixed replacement or a guarded one. */
interface Rule {
  re: RegExp;
  to: string | ((match: string, ...rest: string[]) => string);
}

/**
 * Rules ordered specific -> generic. Provider-prefixed tokens win first; the
 * entropy fallbacks run last. Every regex is linear time.
 */
const RULES: Rule[] = [
  // PEM private-key blocks.
  {
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
    to: REDACTED,
  },
  { re: /sk-ant-[A-Za-z0-9_-]{40,}/g, to: REDACTED },
  { re: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, to: REDACTED },
  { re: /\b(?:gh[opusr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g, to: REDACTED },
  { re: /\bglpat-[A-Za-z0-9_-]{20}\b/g, to: REDACTED },
  { re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ABIA|ACCA)[A-Z0-9]{16}\b/g, to: REDACTED },
  { re: /\bAIza[A-Za-z0-9_-]{35}\b/g, to: REDACTED },
  { re: /\bya29\.[A-Za-z0-9_-]{20,}/g, to: REDACTED },
  { re: /\bxox[baprse]-[A-Za-z0-9-]{10,48}\b/g, to: REDACTED },
  { re: /\bxapp-[0-9]-[A-Za-z0-9-]{10,}\b/g, to: REDACTED },
  {
    re: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]{24}/g,
    to: REDACTED,
  },
  { re: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,99}\b/g, to: REDACTED },
  { re: /\bwhsec_[A-Za-z0-9]{20,}\b/g, to: REDACTED },
  { re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, to: REDACTED },
  { re: /\bnpm_[A-Za-z0-9]{36}\b/g, to: REDACTED },
  { re: /\bdop_v1_[a-f0-9]{64}\b/g, to: REDACTED },
  { re: /\bhf_[A-Za-z0-9]{30,}\b/g, to: REDACTED },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*\b/g, to: REDACTED },
  // Authorization headers, in header and JSON-serialised form.
  { re: /\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}={0,2}/g, to: `$1${REDACTED}` },
  { re: /(Authorization"?\s*:\s*"?)(?:Basic|Token)\s+[A-Za-z0-9+/._-]{8,}={0,2}/gi, to: `$1${REDACTED}` },
  // URLs carrying inline user:password credentials.
  {
    re: /\b(https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?|ftp):\/\/([^:@/\s]+):[^@/\s]+@/gi,
    to: `$1://$2:${REDACTED}@`,
  },
  // Keyword + quoted 40-char base64: the AWS secret-key shape.
  {
    re: /((?:aws|secret|access)[^\n]{0,40}?["'])([A-Za-z0-9/+=]{40})(["'])/gi,
    to: (m, g1, g2, g3) => (entropy(g2) >= 4.0 ? `${g1}${REDACTED}${g3}` : m),
  },
  // key=value / key: value credential assignment, placeholder-guarded. A quoted
  // value is taken whole, so a secret with a space in it cannot half survive.
  {
    re: /(password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|client[_-]?secret|auth[_-]?token|token)(\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s"']{6,})/gi,
    to: (m, g1, g2, g3: string) =>
      isPlaceholder(g3.replace(/^["']|["']$/g, "")) ? m : `${g1}${g2}${REDACTED}`,
  },
  // KEY=value shell/.env lines whose KEY names a credential. The value is one
  // token (or one quoted string), never the rest of the line: an env prefix such
  // as `API_KEY=sk-... bun run x` must keep the command it runs.
  {
    re: /^([ \t]*(?:export[ \t]+)?)([A-Z][A-Z0-9_]*)([ \t]*=[ \t]*)("[^"]*"|'[^']*'|\S+)(.*)$/gm,
    to: (m, pre: string, key: string, sep: string, val: string, rest: string) => {
      const sensitive = key
        .split("_")
        .some((s) =>
          /^(?:KEY|KEYS|TOKEN|TOKENS|SECRET|SECRETS|PASSWORD|PASSWD|PWD|PASS|CRED|CREDS|CREDENTIAL|CREDENTIALS|APIKEY|PASSPHRASE|SIGNINGKEY)$/.test(s),
        );
      const descriptive =
        /(?:VERSION|URL|URI|HOST|PORT|PATH|DIR|NAME|ENABLED|DISABLED|MODE|ENV|REGION|BASE|ENDPOINT|PROVIDER|TYPE|PUBLIC|TIMEOUT|COUNT|LEVEL|FORMAT|PREFIX|SUFFIX)$/.test(key);
      if (!sensitive || descriptive) return m;
      return isPlaceholder(val.replace(/^["']|["']$/g, ""))
        ? m
        : `${pre}${key}${sep}${REDACTED}${rest}`;
    },
  },
  // Long base64url run, only next to a credential keyword.
  {
    re: /[A-Za-z0-9_-]{32,}={0,2}/g,
    to: (m, ...rest) => {
      if (m.length > 512 || BLOB_MAGIC.test(m)) return m;
      if (!/[0-9]/.test(m) || !/[A-Za-z]/.test(m)) return m;
      if (isPlaceholder(m) || !credContextAt(rest)) return m;
      return entropy(m) >= 3.5 ? REDACTED : m;
    },
  },
  // Long hex run, only next to a credential keyword.
  {
    re: /\b[0-9a-fA-F]{32,}\b/g,
    to: (m, ...rest) => {
      if (!/[a-fA-F]/.test(m) || !/[0-9]/.test(m)) return m;
      if (!credContextAt(rest)) return m;
      return entropy(m) >= 3.0 ? REDACTED : m;
    },
  },
];

/**
 * Redact secret-looking substrings from one string. Returns the input unchanged
 * when nothing matches.
 */
export const redactText = (s: string) => {
  if (!s) return s;
  let out = s;
  for (const { re, to } of RULES) out = typeof to === "string" ? out.replace(re, to) : out.replace(re, to);
  return out;
};

/**
 * Redact when `enabled`, otherwise pass through. Keeps call sites free of
 * `options.redact ? ... : ...` noise.
 */
export const redactIf = (enabled: boolean, s: string) => (enabled ? redactText(s) : s);
