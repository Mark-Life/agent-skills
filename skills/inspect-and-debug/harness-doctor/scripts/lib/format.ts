/**
 * Number and markdown-table formatting for the summary.
 *
 * Nothing here uses `toLocaleString`: locale data varies between runtimes, and the
 * summary has to be byte-identical across machines.
 */

/** Thousands separators, locale-independent. */
export const group = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Whole number with thousands separators. */
export const int = (n: number) => group(n);

/** Token count, compacted: 1234 -> "1.2k", 12345678 -> "12.35M". */
export const tok = (n: number) => {
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  if (abs < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
};

/** Seconds, promoted to minutes or hours once the number stops being readable. */
export const sec = (n: number) => {
  const abs = Math.abs(n);
  if (abs < 90) return `${n.toFixed(1)}s`;
  if (abs < 5400) return `${(n / 60).toFixed(1)}m`;
  return `${(n / 3600).toFixed(1)}h`;
};

/** USD. Always presented as an estimate by the surrounding text. */
export const usd = (n: number) => {
  if (Math.abs(n) < 1) return `$${n.toFixed(4)}`;
  const [whole = "0", cents = "00"] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}$${group(Number(whole))}.${cents}`;
};

/** Fraction in 0..1 as a percentage with one decimal. */
export const pct = (frac: number) => `${(frac * 100).toFixed(1)}%`;

/** "1 bin", "3 bins": keeps a headline readable when the count is 1. */
export const plural = (n: number, word: string, many = `${word}s`) =>
  `${int(n)} ${Math.round(n) === 1 ? word : many}`;

/** Table cell: pipes escaped, newlines flattened, length capped. */
export const cell = (value: string | number, max = 70) => {
  const s = String(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

/** A markdown table as lines, or a single "(none)" line when there are no rows. */
export const table = (
  headers: readonly string[],
  rows: readonly (string | number)[][],
) => {
  if (rows.length === 0) return ["(none)"];
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.map((v) => cell(v)).join(" | ")} |`),
  ];
};
