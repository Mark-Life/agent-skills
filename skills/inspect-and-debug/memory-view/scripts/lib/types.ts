/** Shared types for memory-view — the frozen contract every lib module builds against. */

/** Findings.json contract version. SKILL.md hard-stops on a mismatch. */
export const SCHEMA_VERSION = 1;

/** Documented memory types (frontmatter `type`). Real files may carry an invalid value. */
export type MemoryType = "user" | "feedback" | "project" | "reference";

/** Frontmatter schema variant observed on disk. */
export type SchemaShape = "nested" | "flat" | "none";

/** Finding severity, ascending. */
export type Severity = "low" | "med" | "high" | "critical";

/** Detection method: deterministic, model-judgment, or script-candidate-then-model-confirm. */
export type Method = "D" | "M" | "D->M";

/** Apply-safety gate: A auto-safe · B review · C destructive. */
export type Tier = "A" | "B" | "C";

/** Outbound link styles found in bodies. */
export type LinkKind = "wiki" | "markdown";

/**
 * Parsed YAML frontmatter, tolerant of the three on-disk shapes:
 * nested (`metadata:` block with node_type/type/originSessionId), legacy flat
 * (type/originSessionId at top level), and none. `raw` preserves the exact block
 * text so a churn-aware writer can re-emit it minimally.
 */
export interface Frontmatter {
  /** Exact text between the `---` fences (no fences), "" when shape === "none". */
  raw: string;
  shape: SchemaShape;
  name?: string;
  description?: string;
  /** As written; may be an invalid type string (validated by SCH03). */
  type?: string;
  /** metadata.node_type (nested shape only). */
  nodeType?: string;
  /** metadata.originSessionId or top-level originSessionId. */
  originSessionId?: string;
  created?: string;
  updated?: string;
  /** Any other top-level keys preserved verbatim (value as raw string). */
  extra: Record<string, string>;
  /** True when `metadata:` carried trailing whitespace (churn signal HYG01). */
  hadTrailingMetadataWs: boolean;
  /** True when the description value was quoted on disk. */
  descriptionQuoted: boolean;
}

/** A single outbound link parsed from a memory body. */
export interface LinkRef {
  kind: LinkKind;
  /** Target exactly as written (`[[x]]` inner, or the `(y.md)` href). */
  rawTarget: string;
  /** Normalized stem used for resolution (no `.md`, no path, lowercased). */
  targetSlug: string;
  /** 1-based line in the body where the link appears. */
  line: number;
}

/** One memory topic file on disk, fully parsed. */
export interface MemoryFile {
  /** basename, e.g. "e2e-flake-patterns.md". */
  fileName: string;
  /** filename stem, e.g. "e2e-flake-patterns". */
  slug: string;
  /** absolute path. */
  path: string;
  bytes: number;
  lines: number;
  /** mtime as ISO string. */
  mtime: string;
  frontmatter: Frontmatter;
  /** Body markdown after the frontmatter block. */
  body: string;
  /** Hash of the normalized body (whitespace-collapsed, lowercased) for exact-dup detection. */
  bodyHash: string;
  /** Outbound links parsed from the body. */
  links: LinkRef[];
  hasWhy: boolean;
  hasHowToApply: boolean;
  /** Longest single line length in chars (long-line-safe tooling signal). */
  maxLineLength: number;
}

/** One parsed line of the MEMORY.md index. */
export interface IndexEntry {
  /** full raw line text. */
  raw: string;
  /** 1-based line number in MEMORY.md. */
  lineNumber: number;
  label?: string;
  /** link target as written, e.g. "effect-rpc-migration-workflow.md". */
  target?: string;
  /** normalized stem of the target. */
  targetSlug?: string;
  /** hook text after the em-dash separator. */
  hook?: string;
  /** Not a recognizable `- [Label](file.md) — hook` or `[[wiki]]` bullet. */
  malformed: boolean;
  kind: "markdown" | "wiki" | "bare";
}

/** The MEMORY.md index file (or its absence). */
export interface MemoryIndex {
  exists: boolean;
  path: string;
  raw: string;
  bytes: number;
  lines: number;
  entries: IndexEntry[];
  /** True when MEMORY.md is prose/headings, not a bullet index (the log-time case). */
  isMonolithic: boolean;
  overBudget: boolean;
  /** Entries past the 200-line / 25 KB cliff — invisible to Claude (IDX05). */
  belowFoldEntries: IndexEntry[];
}

/** A resolved edge in the link graph (body links + index edges). */
export interface LinkEdge {
  /** source slug (a file slug, or "__index__" for index edges). */
  from: string;
  /** target slug as referenced. */
  to: string;
  kind: "wiki" | "markdown" | "index";
  resolved: boolean;
  /** file slug it resolved to, when resolved. */
  resolvedTo?: string;
  ambiguous?: boolean;
  /** near-match repair candidates when unresolved/ambiguous. */
  candidates?: string[];
  /** 1-based source line (body line, or index line). */
  line?: number;
}

/** A discovered project that has a memory dir (for dead-end pivots & --all). */
export interface ProjectRef {
  slug: string;
  project: string;
  memoryDir: string;
  fileCount: number;
  hasIndex: boolean;
}

/** Vault-level state classification. */
export type VaultState = "ok" | "absent" | "empty" | "monolithic";

/** The whole parsed vault for one project. */
export interface Vault {
  /** encoded project slug, e.g. "-Users-andrey-Code-pickart-app". */
  slug: string;
  /** human-ish project name (last path segment of the decoded cwd). */
  project: string;
  memoryDir: string;
  state: VaultState;
  index: MemoryIndex | null;
  files: MemoryFile[];
  /** non-memory files in the dir (.DS_Store, .bak, backups). */
  strayFiles: string[];
  /** other projects on the machine that have memory (sorted). */
  otherProjects: ProjectRef[];
}

/** A single audit finding (one occurrence). */
export interface Finding {
  /** stable unique id for this occurrence, e.g. "LNK01:rpc-class-success-encode-trap:12". */
  id: string;
  /** catalog id, e.g. "IDX01". */
  check: string;
  name: string;
  severity: Severity;
  method: Method;
  tier: Tier;
  /** affected file slug (or "MEMORY.md"); omitted for vault-level findings. */
  file?: string;
  /** 1-based line, when applicable. */
  line?: number;
  /** human-facing description (redacted when redaction is on). */
  message: string;
  /** short supporting snippet (redacted). */
  evidence?: string;
  /** deterministic suggested remedy text. */
  suggestedFix?: string;
  /** repair targets for fix-link (unique near-matches). */
  candidates?: string[];
}

/** A model-judgment candidate set (emitted to JSON, not asserted as a finding). */
export interface CandidateSet {
  kind:
    | "near-dup"
    | "subsumption"
    | "contradiction"
    | "oversized"
    | "redundancy"
    | "missing-link"
    | "missing-why-how";
  /** related catalog id, e.g. "DUP02". */
  check: string;
  /** file slugs involved. */
  members: string[];
  /** 0..1 similarity / confidence where meaningful. */
  score?: number;
  /** redacted supporting snippets/terms for the model to confirm. */
  evidence?: string;
  note?: string;
}

/** Per-node graph summary for the arc view. */
export interface GraphNode {
  slug: string;
  type: string;
  bytes: number;
  inIndex: boolean;
  inDeg: number;
  outDeg: number;
}

/** Resolved link graph. */
export interface GraphData {
  nodes: GraphNode[];
  edges: LinkEdge[];
  /** file slugs with no resolved in/out body links. */
  orphans: string[];
}

/** Index budget summary (the headline gauge). */
export interface IndexBudget {
  lines: number;
  maxLines: number;
  bytes: number;
  maxBytes: number;
  overBudget: boolean;
  belowFoldCount: number;
  /** "index" | "monolithic" | "absent" — drives the gauge's narrative. */
  kind: "index" | "monolithic" | "absent";
}

/** Catalog metadata for a check id, shared by audit + render. */
export interface CheckMeta {
  id: string;
  name: string;
  group: string;
  method: Method;
  tier: Tier;
  severity: Severity;
}

/** Fully analyzed vault, ready to render and to serialize as findings.json. */
export interface AnalyzedVault extends Vault {
  schemaVersion: number;
  /** ISO timestamp string stamped by the orchestrator (scripts can't call Date.now). */
  generatedAt?: string;
  findings: Finding[];
  candidates: CandidateSet[];
  graph: GraphData;
  indexBudget: IndexBudget;
  /** type -> count over content files. */
  typeCounts: Record<string, number>;
  totalBytes: number;
  /** severity -> count over findings. */
  severityCounts: Record<Severity, number>;
  redacted: boolean;
}
