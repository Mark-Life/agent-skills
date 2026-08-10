/**
 * Per-model price table and cost maths.
 *
 * Every number this file produces is an ESTIMATE. The rates below are published
 * list prices for the Claude 4.x / 5 families as of 2026-08-10, in USD per million
 * tokens. They ignore batch discounts, the long-context tier, and any account-level
 * pricing. Check https://claude.com/pricing, and the model card for the exact id,
 * before quoting a number from here. Override the table with `--pricing <file>`.
 */

import { readFileSync } from "node:fs";
import type { ModelPrice, PriceTable, TokenTotals } from "./types.ts";

/** Token counts to price, with the model that produced them. */
export interface TokenUsage extends TokenTotals {
  /** Model id. Absent or unmatched ids fall back to the sonnet family. */
  model?: string;
}

/** Built-in rates: USD per million tokens. Estimates, see the file header. */
export const DEFAULT_PRICING: PriceTable = {
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

/** Family names tried as substrings of a model id. */
const FAMILIES = ["opus", "sonnet", "haiku"] as const;

/** Family used when a model id matches nothing. Such ids are reported separately. */
export const FALLBACK_FAMILY = "sonnet";

/** Provenance line for the rates, echoed into `tokens.note`. */
export const PRICING_NOTE =
  "Estimated cost. Rates are published list prices per million tokens, checked 2026-08-10 at https://claude.com/pricing: no batch discount, no long-context tier, no account terms. Cache reads and cache writes are priced separately from input. Override with --pricing.";

/** Result of matching a model id to a rate card. */
export interface PriceMatch {
  /** Table key that supplied the rates: an exact model id, or a family name. */
  family: string;
  rates: ModelPrice;
  /** False when the id matched nothing and fell back to the sonnet family. */
  priced: boolean;
}

/**
 * Match a model id to its rates: exact table key first (so a `--pricing` file can
 * name one model), then a family substring (`opus`, `sonnet`, `haiku`), then the
 * sonnet fallback with `priced: false` so the caller can list the id as unpriced.
 */
export const priceFor = (
  modelId: string,
  pricing: PriceTable = DEFAULT_PRICING,
): PriceMatch => {
  const id = (modelId ?? "").trim().toLowerCase();
  if (id !== "") {
    for (const key of Object.keys(pricing).sort()) {
      const rates = pricing[key];
      if (rates && key.toLowerCase() === id) {
        return { family: key, rates, priced: true };
      }
    }
    for (const family of FAMILIES) {
      if (id.includes(family)) {
        const rates = pricing[family] ?? DEFAULT_PRICING[family];
        if (rates) return { family, rates, priced: true };
      }
    }
  }
  const fallback = pricing[FALLBACK_FAMILY] ?? DEFAULT_PRICING[FALLBACK_FAMILY];
  return {
    family: FALLBACK_FAMILY,
    rates: fallback ?? { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
    priced: false,
  };
};

/**
 * Estimated USD for one usage block. Cache writes bill at the cacheWrite rate and
 * cache reads at the cacheRead rate: both are separate from plain input tokens.
 */
export const estimateCost = (
  usage: TokenUsage,
  pricing: PriceTable = DEFAULT_PRICING,
) => {
  const { rates } = priceFor(usage.model ?? "", pricing);
  const perToken = 1e-6;
  return (
    usage.in * rates.input * perToken +
    usage.out * rates.output * perToken +
    usage.cacheRead * rates.cacheRead * perToken +
    usage.cacheCreate * rates.cacheWrite * perToken
  );
};

/** Rate keys a `--pricing` entry must supply for every family it defines. */
const RATE_KEYS: readonly (keyof ModelPrice)[] = [
  "input",
  "output",
  "cacheWrite",
  "cacheRead",
];

/** Narrow an unknown value to a complete ModelPrice, or return undefined. */
const asRates = (value: unknown): ModelPrice | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const rec = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of RATE_KEYS) {
    const n = rec[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return undefined;
    out[key] = n;
  }
  return out as unknown as ModelPrice;
};

/**
 * Load a price table. With no path, returns a copy of the built-in table. With a
 * path, reads that JSON file and merges its entries over the built-in families, so
 * a file may override one family or add exact model ids. Throws a plain Error
 * naming the path when the file is unreadable or an entry is not a full rate card.
 */
export const loadPricing = (path?: string): PriceTable => {
  if (!path) return { ...DEFAULT_PRICING };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(
      `--pricing: cannot read JSON at ${path}: ${(err as Error).message}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`--pricing: ${path} must be a JSON object of rate cards`);
  }
  const merged: PriceTable = { ...DEFAULT_PRICING };
  const bad: string[] = [];
  for (const key of Object.keys(parsed as Record<string, unknown>).sort()) {
    const rates = asRates((parsed as Record<string, unknown>)[key]);
    if (rates) merged[key] = rates;
    else bad.push(key);
  }
  if (bad.length > 0) {
    throw new Error(
      `--pricing: ${path} entries need numeric input, output, cacheWrite, cacheRead: ${bad.join(", ")}`,
    );
  }
  return merged;
};
