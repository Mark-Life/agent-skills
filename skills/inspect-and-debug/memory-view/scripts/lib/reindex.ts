/** Deterministic write/check subcommands for the apply pipeline (§7, §10):
 *
 *  - buildCanonicalIndex: regenerate MEMORY.md as a canonical bullet index,
 *    preserving the existing entry order and appending new files alphabetically.
 *    HARD-BLOCKS a monolithic (prose) MEMORY.md so content is never overwritten.
 *  - validateVault: re-run the integrity-critical check subset over the current
 *    vault + graph and return the regressions that must abort/restore an apply.
 *
 * Kept independent of audit.ts so the re-sync path stays minimal and self-contained.
 */
import type { Finding, GraphData, IndexEntry, MemoryFile, Severity, Method, Tier, Vault } from "./types.ts";

const MAX_INDEX_LINES = 200;
const MAX_INDEX_BYTES = 25 * 1024;

/** Collapse internal newlines/whitespace to single spaces and trim; returns the full string. */
const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * Canonical `- [Label](file.md) — hook` line for one content file. Preserves a
 * human-curated label/hook from the existing index entry when present (so a
 * deliberate Title-Case label is never clobbered by the kebab `name`); only
 * new/orphan files get a label/hook synthesized from frontmatter.
 */
const indexLine = (f: MemoryFile, existing?: IndexEntry): string => {
  const label = (existing?.label ?? f.frontmatter.name ?? f.slug).trim();
  const hook = oneLine(existing?.hook ?? f.frontmatter.description ?? "");
  return hook ? `- [${label}](${f.fileName}) — ${hook}` : `- [${label}](${f.fileName})`;
};

/**
 * Order content files for the regenerated index: files already present in the
 * existing MEMORY.md keep their original order; new/orphan files are appended
 * sorted alphabetically by slug. Stable and fully deterministic.
 */
const orderFiles = (vault: Vault): MemoryFile[] => {
  const bySlug = new Map(vault.files.map((f) => [f.slug, f]));
  const seen = new Set<string>();
  const ordered: MemoryFile[] = [];
  for (const e of vault.index?.entries ?? []) {
    const slug = e.targetSlug;
    if (!slug || seen.has(slug)) continue;
    const file = bySlug.get(slug);
    if (file) {
      ordered.push(file);
      seen.add(slug);
    }
  }
  const rest = vault.files.filter((f) => !seen.has(f.slug)).sort((a, b) => a.slug.localeCompare(b.slug));
  return [...ordered, ...rest];
};

/**
 * Regenerate MEMORY.md canonically from the content files. Returns the new file
 * content (trailing newline included). Blocks outright on a monolithic MEMORY.md
 * (IDX11). When the regenerated index would exceed the 200-line / 25 KB budget it
 * still returns the content but notes the overflow in `reason`.
 */
export const buildCanonicalIndex = (vault: Vault): { content: string; blocked: boolean; reason?: string } => {
  if (vault.index?.isMonolithic) {
    return {
      content: "",
      blocked: true,
      reason: "MEMORY.md is monolithic prose, not an index — refusing to overwrite (IDX11)",
    };
  }
  const entryBySlug = new Map(
    (vault.index?.entries ?? []).filter((e) => e.targetSlug).map((e) => [e.targetSlug!, e] as const),
  );
  const lines = orderFiles(vault).map((f) => indexLine(f, entryBySlug.get(f.slug)));
  const content = lines.length ? `${lines.join("\n")}\n` : "";
  const bytes = Buffer.byteLength(content, "utf8");
  const overBudget = lines.length > MAX_INDEX_LINES || bytes > MAX_INDEX_BYTES;
  const reason = overBudget
    ? `Regenerated index is ${lines.length} lines / ${bytes} B — exceeds the 200-line / 25 KB budget (IDX04)`
    : undefined;
  return { content, blocked: false, reason };
};

/** Construct a minimal integrity Finding (validateVault builds these directly). */
const mk = (
  check: string,
  name: string,
  severity: Severity,
  method: Method,
  tier: Tier,
  message: string,
  parts: { file?: string; line?: number },
): Finding => {
  const idTail = [check, parts.file, parts.line].filter((p) => p !== undefined).join(":");
  return { id: idTail, check, name, severity, method, tier, message, ...parts };
};

/**
 * Re-run the integrity-critical check subset over the post-edit vault + graph and
 * return every regression: unresolved body links (broken, low), dangling index
 * entries, an over-budget index, and missing required frontmatter fields. `ok` is
 * false only when a high/critical regression remains — a dangling index entry
 * (IDX02) or an over-budget index (IDX04) — so low/med findings are reported but
 * never hard-block the apply gate (§10 step 4).
 */
export const validateVault = (vault: Vault, graph: GraphData): { ok: boolean; regressions: Finding[] } => {
  const regressions: Finding[] = [];

  for (const e of graph.edges) {
    if (e.kind === "index") {
      if (!e.resolved) {
        regressions.push(
          mk("IDX02", "Dangling index entry", "high", "D", "B", `Index entry links missing file "${e.to}"`, {
            file: "MEMORY.md",
            line: e.line,
          }),
        );
      }
      continue;
    }
    if (!e.resolved) {
      regressions.push(
        mk("LNK01", "Broken link", "low", "D", "B", `Broken ${e.kind} link to "${e.to}"`, {
          file: e.from,
          line: e.line,
        }),
      );
    }
  }

  if (vault.index?.overBudget) {
    regressions.push(
      mk("IDX04", "MEMORY.md over budget", "high", "D", "B", "MEMORY.md exceeds the 200-line / 25 KB budget", {
        file: "MEMORY.md",
      }),
    );
  }

  for (const f of vault.files) {
    const missing = (["name", "description", "type"] as const).filter((k) => !f.frontmatter[k]);
    if (missing.length) {
      regressions.push(
        mk("SCH02", "Missing required field", "med", "D", "B", `Missing frontmatter field(s): ${missing.join(", ")}`, {
          file: f.slug,
        }),
      );
    }
  }

  const blocking = regressions.some((r) => r.severity === "high" || r.severity === "critical");
  return { ok: !blocking, regressions };
};
