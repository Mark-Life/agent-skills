/** Assemble the fully-analyzed vault and serialize the versioned findings.json —
 * the deterministic script's handoff to the model layer. The serialized JSON has
 * a stable, deterministic key order so re-runs over an unchanged vault diff cleanly.
 */
import type {
  AnalyzedVault,
  CandidateSet,
  Finding,
  GraphData,
  IndexBudget,
  Severity,
  Vault,
} from "./types.ts";
import { SCHEMA_VERSION } from "./types.ts";

const MAX_INDEX_LINES = 200;
const MAX_INDEX_BYTES = 25 * 1024;

/** Tally findings by severity, always emitting all four buckets (zeros included). */
const countSeverities = (findings: Finding[]): Record<Severity, number> => {
  const counts: Record<Severity, number> = { low: 0, med: 0, high: 0, critical: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
};

/** Tally content files by their frontmatter `type` (missing → "unknown"). */
const countTypes = (vault: Vault): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const f of vault.files) {
    const t = f.frontmatter.type ?? "unknown";
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
};

/** Derive the headline index-budget gauge from the vault's index + state. */
const computeBudget = (vault: Vault): IndexBudget => {
  const index = vault.index;
  const kind: IndexBudget["kind"] = index?.isMonolithic
    ? "monolithic"
    : vault.state === "absent" || vault.state === "empty" || !index
      ? "absent"
      : "index";
  return {
    lines: index?.lines ?? 0,
    maxLines: MAX_INDEX_LINES,
    bytes: index?.bytes ?? 0,
    maxBytes: MAX_INDEX_BYTES,
    overBudget: !!index?.overBudget,
    belowFoldCount: index?.belowFoldEntries.length ?? 0,
    kind,
  };
};

/**
 * Combine the parsed vault, resolved graph, deterministic findings, and model
 * candidate sets into the single render/serialize-ready AnalyzedVault. Stamps the
 * schema version and computes the budget gauge, type tally, byte total, and
 * severity tally. `redacted` starts false; `redactVault()` flips it when applied.
 */
export const assembleVault = (
  vault: Vault,
  graph: GraphData,
  findings: Finding[],
  candidates: CandidateSet[],
): AnalyzedVault => ({
  ...vault,
  schemaVersion: SCHEMA_VERSION,
  findings,
  candidates,
  graph,
  indexBudget: computeBudget(vault),
  typeCounts: countTypes(vault),
  totalBytes: vault.files.reduce((sum, f) => sum + f.bytes, 0),
  severityCounts: countSeverities(findings),
  redacted: false,
});

/**
 * Serialize the analyzed vault to the model's findings.json input: pretty
 * 2-space JSON with a fixed top-level key order and a per-file summary projection.
 * Carries no comments and no derived HTML — just the contract the model reads.
 */
export const serializeFindings = (av: AnalyzedVault): string => {
  const inIndex = new Map(av.graph.nodes.map((n) => [n.slug, n.inIndex]));
  const files = av.files.map((f) => ({
    slug: f.slug,
    type: f.frontmatter.type ?? "unknown",
    bytes: f.bytes,
    lines: f.lines,
    inIndex: inIndex.get(f.slug) ?? false,
    hasWhy: f.hasWhy,
    hasHowToApply: f.hasHowToApply,
  }));
  const payload = {
    schemaVersion: av.schemaVersion,
    slug: av.slug,
    project: av.project,
    state: av.state,
    generatedAt: av.generatedAt ?? null,
    indexBudget: av.indexBudget,
    typeCounts: av.typeCounts,
    severityCounts: av.severityCounts,
    files,
    findings: av.findings,
    candidates: av.candidates,
  };
  return JSON.stringify(payload, null, 2);
};
