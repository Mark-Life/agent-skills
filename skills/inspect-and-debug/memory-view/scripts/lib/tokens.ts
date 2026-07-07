/** Token estimation, number/byte formatting, and HTML-escaping helpers. */

/**
 * Estimate token count from a string using the chars/4 heuristic.
 * Used for per-item sizing only; headline totals come from real usage metadata.
 */
export const estTokens = (s: string): number =>
  s ? Math.round(s.length / 4) : 0;

/** Format a token/number count with thousands separators. */
export const fmt = (n: number): string =>
  Math.round(n).toLocaleString("en-US");

/** Compact token count, e.g. 531202 -> "531.2k". */
export const fmtK = (n: number): string => {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
};

/** Format a percentage to one decimal, e.g. 0.412 -> "41.2%". */
export const fmtPct = (frac: number): string => `${(frac * 100).toFixed(1)}%`;

/** Human-readable byte size. */
export const fmtBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

/** Human-readable duration from milliseconds. */
export const fmtDuration = (ms: number): string => {
  if (ms <= 0 || !Number.isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
};

/**
 * Escape a string for safe insertion into HTML text/attribute context.
 * Transcript content is fully untrusted — every interpolated value passes here.
 */
export const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** First non-empty line of a string, trimmed and length-capped. */
export const firstLine = (s: string, cap = 200): string => {
  const line = (s || "").split("\n").find((l) => l.trim().length > 0) ?? "";
  const t = line.trim();
  return t.length > cap ? `${t.slice(0, cap)}…` : t;
};

/** Cap a string to a max length, appending an ellipsis marker when truncated. */
export const cap = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}\n… [truncated ${fmt(s.length - max)} chars]` : s;
