/**
 * Deterministic numeric, grouping, and ranking helpers shared by the aggregate
 * sections and the markdown renderer.
 *
 * Every ranking sorts by the metric, then by a stable string tiebreaker, and every
 * Record is built with its keys inserted in sorted order, so two runs over the same
 * rows produce byte-identical output.
 */

import type { Ranking } from "./types.ts";

/** Sum a numeric field over items. Returns 0 for an empty list. */
export const sum = <T>(items: readonly T[], f: (x: T) => number) =>
  items.reduce((acc, x) => acc + f(x), 0);

/** Round to `digits` decimal places and normalise -0 to 0. */
export const round = (n: number, digits = 2) => {
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** digits;
  const v = Math.round(n * p) / p;
  return Object.is(v, -0) ? 0 : v;
};

/** Divide, returning 0 when the denominator is 0 or not finite. */
export const safeDiv = (a: number, b: number) =>
  b === 0 || !Number.isFinite(b) ? 0 : a / b;

/**
 * Nearest-rank percentile of an unsorted numeric list.
 * `p` is a fraction in [0,1]. Returns 0 for an empty list.
 */
export const percentile = (values: readonly number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx] ?? 0;
};

/** Median of an unsorted numeric list. Returns 0 for an empty list. */
export const median = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

/**
 * Group items into a Map keyed by a string.
 * Map insertion order is never used for output: callers rank or sort the entries.
 */
export const groupBy = <T>(items: readonly T[], key: (x: T) => string) => {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
};

/** Increment a counter in a Map. */
export const bump = (counts: Map<string, number>, key: string, by = 1) => {
  counts.set(key, (counts.get(key) ?? 0) + by);
};

/** Plain ascending string compare, locale-independent. */
export const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Sorted unique strings. */
export const uniqSorted = (values: Iterable<string>) =>
  [...new Set(values)].sort(cmpStr);

/**
 * Key with the highest count. Ties break on the lexicographically smallest key,
 * so the answer never depends on Map insertion order.
 */
export const topKey = (counts: Map<string, number>) => {
  let best = "";
  let bestN = -1;
  for (const key of uniqSorted(counts.keys())) {
    const n = counts.get(key) ?? 0;
    if (n > bestN) {
      best = key;
      bestN = n;
    }
  }
  return best;
};

/** Build a Record with keys inserted in sorted order, so JSON output is stable. */
export const sortedRecord = <T>(entries: readonly (readonly [string, T])[]) => {
  const out: Record<string, T> = {};
  for (const [key, value] of [...entries].sort((a, b) => cmpStr(a[0], b[0]))) {
    out[key] = value;
  }
  return out;
};

/**
 * Sort rows by `metric` descending, break ties on `tiebreak` ascending, then keep
 * the first `top` rows. How many rows were dropped is always reported.
 */
export const ranking = <T>(
  rows: readonly T[],
  metric: (x: T) => number,
  tiebreak: (x: T) => string,
  top: number,
): Ranking<T> => {
  const sorted = [...rows].sort((a, b) => {
    const d = metric(b) - metric(a);
    if (d !== 0) return d;
    return cmpStr(tiebreak(a), tiebreak(b));
  });
  return capRanking(sorted, top);
};

/** Wrap an already-ordered list in the Ranking shape without re-sorting it. */
export const capRanking = <T>(rows: readonly T[], top: number): Ranking<T> => {
  const cap = Math.max(0, Math.floor(top));
  const kept = rows.slice(0, cap);
  return {
    rows: kept,
    shown: kept.length,
    total: rows.length,
    dropped: Math.max(0, rows.length - kept.length),
  };
};

/** Epoch seconds to an ISO-8601 string. Unusable input renders as an empty string. */
export const isoOf = (epochSec: number | undefined) =>
  epochSec === undefined || !Number.isFinite(epochSec) || epochSec <= 0
    ? ""
    : new Date(Math.round(epochSec) * 1000).toISOString();

/** Collapse all whitespace runs to single spaces and trim. */
export const collapseWs = (s: string) => s.replace(/\s+/g, " ").trim();

/** Cap a string to `max` characters, marking the cut with a single ellipsis char. */
export const clip = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max)}…` : s;

/**
 * Sort rows by their epoch-second field ascending, keeping rows without a
 * timestamp out of the result. Ties keep input order, which is transcript order.
 */
export const byTime = <T extends { t?: number }>(rows: readonly T[]) =>
  rows.filter((r) => typeof r.t === "number").sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
