/** Deterministic audit pass over a parsed vault + resolved graph.
 *
 * Emits one {@link Finding} per concrete occurrence for every check the script
 * decides with certainty (the "Deterministic owns" set in PLAN §8). Model-judged
 * and candidate-only checks live elsewhere. Findings are sorted deterministically
 * so two scans of the same vault produce byte-identical output.
 */
import type {
  Vault,
  GraphData,
  Finding,
  CheckMeta,
  Severity,
  Method,
  Tier,
  IndexEntry,
} from "./types.ts";
import { normalizeSlug } from "./parse.ts";
import { redactText } from "./redact.ts";

/** Documented memory `type` values; anything else trips SCH03. */
const VALID_TYPES = new Set(["user", "feedback", "project", "reference"]);
/** Fields a topic file should declare in frontmatter (SCH02). */
const REQUIRED_FIELDS = ["name", "description", "type"] as const;
/** Severity sort rank, ascending (critical first). */
const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, med: 2, low: 3 };
const INDEX_FILE = "MEMORY.md";

/** Terse builder for a catalog entry. */
const meta = (
  id: string,
  name: string,
  group: string,
  method: Method,
  tier: Tier,
  severity: Severity,
): CheckMeta => ({ id, name, group, method, tier, severity });

const IDX = "Index & file integrity";
const LNK = "Links & graph";
const SCH = "Schema / frontmatter";
const HYG = "General hygiene";
const STA = "Staleness";
const DUP = "Duplication";
const SEC = "Secrets / privacy";

/** Catalog metadata for every check id this module can emit. */
export const CHECK_META: Record<string, CheckMeta> = {
  IDX01: meta("IDX01", "Orphan file", IDX, "D", "A", "med"),
  IDX02: meta("IDX02", "Dangling index entry", IDX, "D", "B", "high"),
  IDX04: meta("IDX04", "MEMORY.md over budget", IDX, "D", "B", "high"),
  IDX05: meta("IDX05", "Below-the-fold entries", IDX, "D", "B", "high"),
  IDX07: meta("IDX07", "Malformed index line", IDX, "D", "A", "low"),
  IDX08: meta("IDX08", "Duplicate index entries", IDX, "D", "A", "low"),
  IDX09: meta("IDX09", "Slug/filename convention", IDX, "D", "B", "low"),
  IDX10: meta("IDX10", "Stray non-memory files", IDX, "D", "A", "low"),
  IDX11: meta("IDX11", "Monolithic MEMORY.md", IDX, "D", "B", "med"),
  IDX12: meta("IDX12", "Empty/cruft memory dir", IDX, "D", "C", "low"),
  LNK01: meta("LNK01", "Broken wiki link", LNK, "D", "A", "low"),
  LNK02: meta("LNK02", "Broken markdown link", LNK, "D", "A", "low"),
  LNK03: meta("LNK03", "Self-link", LNK, "D", "A", "low"),
  LNK04: meta("LNK04", "Ambiguous link", LNK, "D", "B", "low"),
  SCH01: meta("SCH01", "Missing frontmatter", SCH, "D", "B", "med"),
  SCH02: meta("SCH02", "Missing required field", SCH, "D", "B", "med"),
  SCH03: meta("SCH03", "Invalid type", SCH, "D", "B", "med"),
  SCH08: meta("SCH08", "name != filename", SCH, "D", "A", "low"),
  SCH09: meta("SCH09", "Empty body", SCH, "D", "B", "med"),
  HYG01: meta("HYG01", "Whitespace/encoding", HYG, "D", "A", "low"),
  HYG04: meta("HYG04", "Title duplicated", HYG, "D", "A", "low"),
  HYG05: meta("HYG05", "Placeholder", HYG, "D", "B", "low"),
  STA01: meta("STA01", "Relative date", STA, "D", "A", "med"),
  DUP01: meta("DUP01", "Exact duplicate", DUP, "D", "C", "med"),
  SEC01: meta("SEC01", "Secret stored", SEC, "D->M", "B", "critical"),
};

/** Optional overrides a check may apply on top of its catalog metadata. */
interface FindingOpts {
  id: string;
  message: string;
  file?: string;
  line?: number;
  evidence?: string;
  suggestedFix?: string;
  candidates?: string[];
  /** Per-occurrence tier override (LNK02 varies by candidate count). */
  tier?: Tier;
}

/**
 * Build a {@link Finding}, pulling name/method/tier/severity from the catalog and
 * omitting any optional field the caller left undefined (keeps JSON output lean).
 */
const make = (check: string, o: FindingOpts): Finding => {
  const m = CHECK_META[check];
  const f: Finding = {
    id: o.id,
    check,
    name: m.name,
    severity: m.severity,
    method: m.method,
    tier: o.tier ?? m.tier,
    message: o.message,
  };
  if (o.file !== undefined) f.file = o.file;
  if (o.line !== undefined) f.line = o.line;
  if (o.evidence !== undefined) f.evidence = o.evidence;
  if (o.suggestedFix !== undefined) f.suggestedFix = o.suggestedFix;
  if (o.candidates !== undefined && o.candidates.length > 0) f.candidates = o.candidates;
  return f;
};

/** First body line whose redaction changes it (best-effort line number for SEC01). */
const firstSecretLine = (body: string): number | undefined => {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) if (redactText(lines[i]) !== lines[i]) return i + 1;
  return undefined;
};

const PLACEHOLDER_RE = /\b(?:TODO|FIXME|XXX)\b|[Ll]orem [Ii]psum/;
const RELATIVE_DATE_RE = /\b(?:yesterday|today|last week|this week|as of (?:today|now))\b/i;

/** First match of a regex in a body, with its 1-based line number. */
const firstMatch = (body: string, re: RegExp): { text: string; line: number } | undefined => {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) return { text: m[0], line: i + 1 };
  }
  return undefined;
};

/** Index & file-integrity checks (require an existing, non-monolithic index). */
const indexChecks = (vault: Vault, graph: GraphData): Finding[] => {
  const out: Finding[] = [];
  const index = vault.index;
  if (!index || !index.exists) return out;

  // IDX01 — files not referenced by the index.
  for (const n of graph.nodes) {
    if (n.inIndex) continue;
    out.push(make("IDX01", { id: `IDX01:${n.slug}`, file: n.slug,
      message: `File "${n.slug}" is not referenced by MEMORY.md.`,
      suggestedFix: "Add an index line for it, or delete if it is junk." }));
  }

  // IDX02 — index entries pointing at a missing file.
  for (const e of graph.edges) {
    if (e.kind !== "index" || e.resolved) continue;
    const entry = index.entries.find((x) => x.lineNumber === e.line);
    out.push(make("IDX02", { id: `IDX02:${INDEX_FILE}:${e.line ?? 0}`, file: INDEX_FILE, line: e.line,
      message: `Index entry points at "${e.to}", which has no file.`,
      evidence: entry?.raw, candidates: e.candidates,
      suggestedFix: "Remove the line, or repoint it to the renamed file." }));
  }

  // IDX04 — index over the 200-line / 25 KB budget.
  if (index.overBudget)
    out.push(make("IDX04", { id: `IDX04:${INDEX_FILE}`, file: INDEX_FILE,
      message: `MEMORY.md is over budget (${index.lines} lines, ${index.bytes} bytes; cap 200 lines / 25 KB).`,
      suggestedFix: "Move detail into topic files and tighten the index." }));

  // IDX05 — entries past the truncation cliff (invisible to Claude).
  if (index.belowFoldEntries.length > 0) {
    const ln = index.belowFoldEntries.map((e) => e.lineNumber);
    out.push(make("IDX05", { id: `IDX05:${INDEX_FILE}`, file: INDEX_FILE, line: ln[0],
      message: `${ln.length} index entr${ln.length === 1 ? "y is" : "ies are"} below the fold and invisible to Claude (lines ${ln.join(", ")}).`,
      suggestedFix: "Reorder important entries above the cliff, or split the index." }));
  }

  // IDX07 — malformed index lines.
  for (const e of index.entries) {
    if (!e.malformed) continue;
    out.push(make("IDX07", { id: `IDX07:${INDEX_FILE}:${e.lineNumber}`, file: INDEX_FILE, line: e.lineNumber,
      message: "Malformed index line (not a recognizable `- [Label](file.md) — hook` bullet).",
      evidence: e.raw, suggestedFix: "Rewrite to canonical `- [Label](file.md) — hook` form." }));
  }

  // IDX08 — the same target linked from more than one entry.
  const bySlug = new Map<string, IndexEntry[]>();
  for (const e of index.entries) {
    if (!e.targetSlug) continue;
    bySlug.set(e.targetSlug, [...(bySlug.get(e.targetSlug) ?? []), e]);
  }
  for (const [slug, g] of bySlug) {
    if (g.length < 2) continue;
    const ln = g.map((e) => e.lineNumber);
    out.push(make("IDX08", { id: `IDX08:${INDEX_FILE}:${slug}`, file: INDEX_FILE, line: ln[0],
      message: `"${slug}" is indexed ${g.length} times (lines ${ln.join(", ")}).`,
      suggestedFix: "Dedupe the index entries." }));
  }

  return out;
};

/** Link checks over resolved body edges. */
const linkChecks = (graph: GraphData): Finding[] => {
  const out: Finding[] = [];
  for (const e of graph.edges) {
    const body = e.kind === "wiki" || e.kind === "markdown";
    if (!body) continue;
    const from = e.from;
    if (e.resolved && e.resolvedTo === from)
      out.push(make("LNK03", { id: `LNK03:${from}:${e.line ?? 0}`, file: from, line: e.line,
        message: `"${from}" links to itself.`, suggestedFix: "Remove the self-link." }));
    if (e.ambiguous)
      out.push(make("LNK04", { id: `LNK04:${from}:${e.line ?? 0}`, file: from, line: e.line,
        message: `Link "${e.to}" is ambiguous — it matches multiple files.`,
        candidates: e.candidates, suggestedFix: "Disambiguate the link target." }));
    if (e.resolved) continue;
    if (e.kind === "wiki") {
      // A dangling [[name]] is a spec-blessed forward reference; only a unique
      // near-match is a likely typo worth flagging.
      if (e.candidates && e.candidates.length === 1)
        out.push(make("LNK01", { id: `LNK01:${from}:${e.line ?? 0}`, file: from, line: e.line,
          message: `Broken wiki link to "${e.to}" — likely a typo for "${e.candidates[0]}".`,
          candidates: e.candidates,
          suggestedFix: `Repair to the unique near-match "${e.candidates[0]}".` }));
    } else {
      const tier: Tier = e.candidates && e.candidates.length === 1 ? "A" : "B";
      out.push(make("LNK02", { id: `LNK02:${from}:${e.line ?? 0}`, file: from, line: e.line, tier,
        message: `Broken markdown link to "${e.to}" — no matching file.`, candidates: e.candidates,
        suggestedFix: tier === "A"
          ? `Repair to the unique near-match "${e.candidates?.[0]}".`
          : "Repair to a chosen target, or remove the link." }));
    }
  }
  return out;
};

/** Per-file schema, size, hygiene, staleness, and secret checks. */
const fileChecks = (vault: Vault): Finding[] => {
  const out: Finding[] = [];

  for (const f of vault.files) {
    const fm = f.frontmatter;

    if (fm.shape === "none") {
      out.push(make("SCH01", { id: `SCH01:${f.slug}`, file: f.slug,
        message: "File has no frontmatter block.",
        suggestedFix: "Add a `---` frontmatter block with name/description/type." }));
    } else {
      const missing = REQUIRED_FIELDS.filter((k) => !fm[k]);
      if (missing.length > 0)
        out.push(make("SCH02", { id: `SCH02:${f.slug}`, file: f.slug,
          message: `Missing required frontmatter field(s): ${missing.join(", ")}.`,
          suggestedFix: "Add the missing field(s) (synthesize from the body if needed)." }));
    }

    if (fm.type && !VALID_TYPES.has(fm.type))
      out.push(make("SCH03", { id: `SCH03:${f.slug}`, file: f.slug,
        message: `Invalid type "${fm.type}" (expected user/feedback/project/reference).`,
        evidence: fm.type, suggestedFix: "Reclassify to a documented type." }));

    if (fm.name && normalizeSlug(fm.name) !== f.slug)
      out.push(make("SCH08", { id: `SCH08:${f.slug}`, file: f.slug,
        message: `Frontmatter name "${fm.name}" does not match filename "${f.slug}".`,
        suggestedFix: "Sync the name to the filename (or rename the file)." }));

    if (f.body.trim() === "")
      out.push(make("SCH09", { id: `SCH09:${f.slug}`, file: f.slug,
        message: "File body is empty (frontmatter only).",
        suggestedFix: "Fill in the memory body, or delete the file." }));

    if (/[A-Z]/.test(f.slug) || (f.slug.includes("-") && f.slug.includes("_")))
      out.push(make("IDX09", { id: `IDX09:${f.slug}`, file: f.slug,
        message: `Filename "${f.slug}" violates kebab-case convention (uppercase or mixed -/_).`,
        suggestedFix: "Rename to consistent kebab-case and repoint references." }));

    const trailingWs = f.body.split("\n").some((l) => /[ \t]+$/.test(l));
    const crlf = f.body.includes("\r");
    if (trailingWs || crlf) {
      const sig = [
        trailingWs ? "trailing line whitespace" : null,
        crlf ? "CRLF line endings" : null,
      ].filter(Boolean);
      out.push(make("HYG01", { id: `HYG01:${f.slug}`, file: f.slug,
        message: `Whitespace/encoding noise: ${sig.join(", ")}.`,
        suggestedFix: "Normalize whitespace (churn-aware)." }));
    }

    if (fm.name) {
      const h1 = f.body.split("\n").find((l) => /^#(?!#)\s+\S/.test(l));
      const h1Text = h1?.replace(/^#\s+/, "").trim();
      if (h1Text && h1Text === fm.name)
        out.push(make("HYG04", { id: `HYG04:${f.slug}`, file: f.slug,
          message: `Title "${fm.name}" is duplicated in frontmatter and the body H1.`,
          suggestedFix: "Drop one of the two titles." }));
    }

    const ph = firstMatch(f.body, PLACEHOLDER_RE);
    if (ph)
      out.push(make("HYG05", { id: `HYG05:${f.slug}:${ph.line}`, file: f.slug, line: ph.line,
        message: `Leftover placeholder "${ph.text}".`, evidence: ph.text,
        suggestedFix: "Resolve or remove the placeholder." }));

    const rd = firstMatch(f.body, RELATIVE_DATE_RE);
    if (rd)
      out.push(make("STA01", { id: `STA01:${f.slug}:${rd.line}`, file: f.slug, line: rd.line,
        message: `Relative date "${rd.text}" will rot — resolve to an absolute date.`, evidence: rd.text,
        suggestedFix: "Replace with an absolute date from created/git/mtime." }));

    // SEC01 — never echo the secret itself.
    if (redactText(f.body) !== f.body) {
      const line = firstSecretLine(f.body);
      out.push(make("SEC01", { id: line ? `SEC01:${f.slug}:${line}` : `SEC01:${f.slug}`, file: f.slug, line,
        message: line ? `Possible secret detected in "${f.slug}" at line ${line}.`
          : `Possible secret detected in "${f.slug}".`,
        suggestedFix: "Redact the value in place and rotate the credential." }));
    }
  }

  // DUP01 — exact duplicate bodies (one finding per pair; skip empty bodies).
  const byHash = new Map<string, string[]>();
  for (const f of vault.files) {
    if (f.body.trim() === "") continue;
    byHash.set(f.bodyHash, [...(byHash.get(f.bodyHash) ?? []), f.slug]);
  }
  for (const slugs of byHash.values()) {
    if (slugs.length < 2) continue;
    const s = [...slugs].sort();
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j < s.length; j++)
        out.push(make("DUP01", { id: `DUP01:${s[i]}:${s[j]}`, file: s[i],
          message: `"${s[i]}" and "${s[j]}" have identical bodies.`,
          suggestedFix: "Delete one and repoint links/index to the survivor." }));
  }

  return out;
};

/**
 * Run every deterministic check against a parsed vault and its resolved graph.
 * Dead-end vaults (absent/empty/monolithic) emit only their single state finding.
 * The returned list is sorted by severity, then check id, file, line, and id.
 */
export const runAudit = (vault: Vault, graph: GraphData): Finding[] => {
  let findings: Finding[];

  if (vault.state === "absent") {
    findings = [];
  } else if (vault.state === "empty") {
    findings = [
      make("IDX12", { id: `IDX12:${vault.slug}`,
        message: "Memory directory exists but contains no memory files.",
        suggestedFix: "Informational: a new or unused project — no action needed (the auto-memory tool manages this directory)." }),
    ];
  } else if (vault.state === "monolithic") {
    findings = [
      make("IDX11", { id: `IDX11:${vault.slug}`, file: INDEX_FILE,
        message: "MEMORY.md is prose/headings, not an index of topic files.",
        suggestedFix: "Offer migration to an index + topic files; `--reindex` is hard-blocked for this case." }),
    ];
  } else {
    findings = [
      ...indexChecks(vault, graph),
      ...linkChecks(graph),
      ...fileChecks(vault),
      ...vault.strayFiles.map((name) =>
        make("IDX10", { id: `IDX10:${name}`, file: name,
          message: `Stray non-memory file "${name}" in the memory directory.`,
          suggestedFix: "Ignore it, or clean it up." }),
      ),
    ];
  }

  return findings.sort(
    (a, b) =>
      SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
      a.check.localeCompare(b.check) ||
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.id.localeCompare(b.id),
  );
};
