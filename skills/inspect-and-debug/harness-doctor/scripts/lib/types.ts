/**
 * Shared types for harness-doctor: the five fact-table row shapes, the parsed
 * CLI options, and every section of the aggregate report.
 *
 * Key names here are the contract between `audit.ts` and `audit.py`: the JSONL
 * fact tables and the `--format json` summary must be identical across both.
 * A field that is absent or unknown is OMITTED from the JSON, never null.
 */

/* ------------------------------------------------------------------ *
 * Fact tables
 * ------------------------------------------------------------------ */

/** Where a transcript sits in the session tree. */
export type SessionKind = "main" | "subagent" | "workflow-agent";

/** One transcript file, summarised. */
export interface SessionRow {
  sid: string;
  /** Encoded project dir name under the transcripts root. */
  proj: string;
  file: string;
  bytes: number;
  cwd?: string;
  branch?: string;
  /** Agent CLI version recorded in the transcript. */
  ver?: string;
  /** Epoch seconds. */
  start?: number;
  end?: number;
  kind: SessionKind;
  /** Session id of the parent, for subagents and workflow agents. */
  parent?: string;
  /** Workflow run id (the wf_* dir), for workflow agents. */
  run?: string;
  assistantMsgs: number;
  userMsgs: number;
  inTokens: number;
  outTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  /** Largest single-request context: input + cacheRead + cacheCreate. */
  maxCtx: number;
  /** cacheCreate on the session's first model call: the fan-out prefix cost. */
  firstTurnCacheCreate: number;
  models: Record<string, number>;
  tools: Record<string, number>;
  interrupts: number;
  errors: number;
}

/** One tool call joined to its result. */
export interface ToolRow {
  sid: string;
  proj: string;
  kind: SessionKind;
  /** Epoch seconds of the tool call. */
  t?: number;
  tool: string;
  /** Result timestamp minus call timestamp. Approximate: includes harness overhead. */
  durSec?: number;
  err: boolean;
  outChars: number;
  /**
   * Tool-specific primary argument: file_path for Read/Edit/Write, pattern for
   * Grep/Glob, url for WebFetch, query for WebSearch, subagent_type for Agent/Task.
   */
  arg?: string;
  /** True when the row comes from a sidechain (subagent) turn. */
  side: boolean;
}

/** One Bash call. Same joined shape as ToolRow, plus the command. */
export interface BashRow extends Omit<ToolRow, "tool" | "arg"> {
  cmd: string;
  desc?: string;
  /** Normalised command family, e.g. "bun run typecheck" or "git log". */
  family: string;
  /** Base binary of the command, e.g. "bun", "git", "rg". */
  bin: string;
  bg: boolean;
  /** First 200 chars of output, 600 when err. */
  out: string;
}

/** One human-visible user turn. */
export interface UserMsgRow {
  sid: string;
  proj: string;
  kind: SessionKind;
  t?: number;
  /** Truncated to 4000 chars. Redacted unless --no-redact. */
  text: string;
  side: boolean;
  /** True when this is real human input: kind === "main" && !side && not a harness echo. */
  human: boolean;
}

/** One errored tool result. */
export interface ErrorRow {
  sid: string;
  proj: string;
  kind: SessionKind;
  t?: number;
  tool: string;
  /** Tool input JSON, truncated to 600 chars, redacted unless --no-redact. */
  input: string;
  /** Error text, truncated to 600 chars, redacted unless --no-redact. */
  msg: string;
  /** Normalised cluster key: paths, numbers, hashes, and quoted strings masked. */
  sig: string;
}

/** The five fact tables held in memory. */
export interface FactTables {
  sessions: SessionRow[];
  tools: ToolRow[];
  bash: BashRow[];
  userMsgs: UserMsgRow[];
  errors: ErrorRow[];
}

/** What `scanTranscripts` returns: the fact tables plus scan counters. */
export interface ScanResult {
  tables: FactTables;
  /** Transcript files parsed. */
  filesScanned: number;
  /** Candidate files skipped: outside the window, filtered out, or unreadable. */
  filesSkipped: number;
  /** Distinct encoded project dirs that contributed at least one session. */
  projectCount: number;
  /** Window start, epoch seconds. */
  fromEpoch: number;
  /** Window end (scan time), epoch seconds. */
  toEpoch: number;
}

/* ------------------------------------------------------------------ *
 * Options and pricing
 * ------------------------------------------------------------------ */

/** Per-million-token USD rates for one model family. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** Price table keyed by model family ("opus", "sonnet", "haiku", ...). */
export interface PriceTable {
  [family: string]: ModelPrice;
}

/** Parsed CLI flags, with every default already resolved. */
export interface AuditOptions {
  /** Window in days, default 30. */
  days: number;
  /** Transcripts root, default <home>/.claude/projects. */
  root: string;
  /** Work dir for the fact tables, default <tmpdir>/harness-audit. */
  out: string;
  /** Only project dirs containing one of these substrings. Empty means all. */
  projects: string[];
  /** stdout summary format. */
  format: "md" | "json";
  /** Rows per ranking, default 15. */
  top: number;
  /** False when --no-tables: compute aggregates without writing fact tables. */
  writeTables: boolean;
  /** False when --no-redact. Redaction is ON by default. */
  redact: boolean;
  /** Path passed to --pricing, if any. */
  pricingPath?: string;
  /** Price table loaded from --pricing, if any. Absent means use the built-in table. */
  pricing?: PriceTable;
}

/**
 * What `aggregate()` is given: the CLI options plus the scan counters that only
 * the scanner knows. Every counter is optional so the aggregation can fall back
 * to deriving it from the rows.
 */
export interface AggregateOptions extends AuditOptions {
  filesScanned?: number;
  filesSkipped?: number;
  projectCount?: number;
  /** Window start, epoch seconds. */
  fromEpoch?: number;
  /** Window end, epoch seconds. */
  toEpoch?: number;
  /** False skips the on-disk probe for the projects section. Default true. */
  checkDisk?: boolean;
}

/* ------------------------------------------------------------------ *
 * Command normalisation
 * ------------------------------------------------------------------ */

/** A shell command reduced to its comparable parts. */
export interface NormalizedCommand {
  /** Normalised family, e.g. "bun run typecheck". */
  family: string;
  /** Base binary after unwrapping sudo/env/npx/bunx/pnpm dlx. */
  bin: string;
  /**
   * Whole command with paths, numbers, hashes, and quoted strings masked but
   * flags kept: the distinctness key for flag-flailing and retry loops.
   */
  normalized: string;
  /** Number of top-level segments joined by `&&`, `||`, `;`, or a pipe. */
  chainLength: number;
  /** True when the command runs in the background (`&` or a `bg` flag). */
  background: boolean;
}

/* ------------------------------------------------------------------ *
 * Aggregate report
 * ------------------------------------------------------------------ */

/**
 * A ranked list capped at `--top`. `total` is how many rows existed before the
 * cap so the renderer can say how many were dropped.
 */
export interface Ranking<T> {
  rows: T[];
  /** Rows in `rows`. */
  shown: number;
  /** Rows before the cap. */
  total: number;
  /** total - shown. */
  dropped: number;
}

/** Token counts, summed. */
export interface TokenTotals {
  in: number;
  out: number;
  cacheRead: number;
  cacheCreate: number;
}

/** What was scanned, and when. */
export interface WindowSection {
  days: number;
  fromIso: string;
  toIso: string;
  filesScanned: number;
  filesSkipped: number;
  sessionsByKind: Record<SessionKind, number>;
  projectCount: number;
}

/** Tokens for one encoded project dir. */
export interface ProjectTokenRow {
  proj: string;
  totals: TokenTotals;
  estCostUsd: number;
  sessions: number;
}

/** Tokens, split every useful way, plus the cost estimate. */
export interface TokensSection {
  totals: TokenTotals;
  byModel: Record<string, TokenTotals>;
  byKind: Record<SessionKind, TokenTotals>;
  byProject: Ranking<ProjectTokenRow>;
  /** Estimate only: rates change, and cache accounting is approximate. */
  estCostUsd: number;
  /** The price table actually used, echoed for auditability. */
  pricing: PriceTable;
  /** Model ids with no family match, priced as sonnet. */
  unpricedModels: string[];
  /** Human-readable warning that the cost is an estimate. */
  note: string;
}

/** Seconds spent in one tool. */
export interface ToolSecondsRow {
  tool: string;
  calls: number;
  totalSec: number;
  medianSec: number;
  p95Sec: number;
  errRate: number;
}

/** Seconds spent in one project. */
export interface ProjectSecondsRow {
  proj: string;
  calls: number;
  totalSec: number;
}

/** Wall-clock attributed to tool calls. Durations are approximate. */
export interface WallClockSection {
  totalToolSec: number;
  byTool: Ranking<ToolSecondsRow>;
  byProject: Ranking<ProjectSecondsRow>;
  /** Says out loud that durSec includes harness overhead and idle time. */
  note: string;
}

/** One normalised command family. */
export interface CommandFamilyRow {
  family: string;
  bin: string;
  count: number;
  totalSec: number;
  medianSec: number;
  p95Sec: number;
  errRate: number;
}

/** An identical command re-run inside one session. */
export interface RepeatCommandRow {
  family: string;
  cmd: string;
  /** Extra runs beyond the first, summed across sessions. */
  occurrences: number;
  sessions: number;
  /** Seconds spent on the repeat runs. */
  wastedSec: number;
}

/** One bin re-tried with many different flag sets inside 10 minutes. */
export interface FlagFlailingRow {
  bin: string;
  sessions: number;
  /** Distinct normalised commands in the flailing bursts. */
  occurrences: number;
  totalSec: number;
  sampleCmds: string[];
}

/** Bash cost, ranked and diagnosed. */
export interface CommandsSection {
  byTotalSec: Ranking<CommandFamilyRow>;
  byCount: Ranking<CommandFamilyRow>;
  repeatsInSession: Ranking<RepeatCommandRow>;
  flagFlailing: Ranking<FlagFlailingRow>;
}

/** Errors sharing a normalised signature. */
export interface ErrorClusterRow {
  sig: string;
  count: number;
  sessionCount: number;
  projects: string[];
  sampleMsg: string;
  topTool: string;
}

/** A binary the shell could not find. */
export interface MissingBinaryRow {
  bin: string;
  count: number;
  sessions: number;
  sampleMsg: string;
}

/** A permission-denied target. */
export interface PermissionDeniedRow {
  target: string;
  count: number;
  sessions: number;
  sampleMsg: string;
}

/** A command re-run within 5 minutes of failing. */
export interface RetryLoopRow {
  family: string;
  count: number;
  medianRetries: number;
  sessions: number;
  sampleCmd: string;
}

/** What failed, clustered. */
export interface ErrorsSection {
  clusters: Ranking<ErrorClusterRow>;
  missingBinaries: Ranking<MissingBinaryRow>;
  permissionDenied: Ranking<PermissionDeniedRow>;
  retryLoops: Ranking<RetryLoopRow>;
}

/** A session ranked by peak context. */
export interface ContextSessionRow {
  sid: string;
  proj: string;
  kind: SessionKind;
  maxCtx: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  estCostUsd: number;
}

/** A single tool call that returned a lot of text. */
export interface BigOutputRow {
  sid: string;
  proj: string;
  tool: string;
  arg?: string;
  outChars: number;
  /** outChars / 4. */
  tokensEst: number;
}

/** The same file read more than once in one session. */
export interface ReReadRow {
  arg: string;
  /** Reads beyond the first, summed across sessions. */
  occurrences: number;
  sessions: number;
  wastedTokensEst: number;
}

/** Context pressure: what filled the window, and what refilled it. */
export interface ContextSection {
  topSessions: Ranking<ContextSessionRow>;
  bigOutputs: Ranking<BigOutputRow>;
  /** p95 outChars per tool, so a big row can be read against its tool's norm. */
  p95CharsByTool: Record<string, number>;
  reReads: Ranking<ReReadRow>;
  /** cacheCreate / (cacheCreate + cacheRead) per session kind. */
  cacheWriteRatio: Record<SessionKind, number>;
}

/** Counts for one web tool. */
export interface WebToolStats {
  calls: number;
  sec: number;
  chars: number;
}

/** The same URL or query fetched more than once. */
export interface WebRepeatRow {
  tool: string;
  arg: string;
  count: number;
  chars: number;
  sessions: number;
  /** True when every repeat happened inside a single workflow run. */
  sameRun: boolean;
}

/** Web traffic concentrated in one workflow run. */
export interface WebRunRow {
  run: string;
  calls: number;
  chars: number;
  agents: number;
}

/** WebFetch and WebSearch: volume, repeats, concentration. */
export interface WebSection {
  byTool: Record<string, WebToolStats>;
  totalCalls: number;
  totalSec: number;
  totalChars: number;
  /** Share of calls whose url/query was already answered elsewhere, 0..1. */
  repeatRate: number;
  repeats: Ranking<WebRepeatRow>;
  byRun: Ranking<WebRunRow>;
}

/** One workflow run, costed. */
export interface FanoutRunRow {
  run: string;
  proj: string;
  agents: number;
  totals: TokenTotals;
  estCostUsd: number;
  medianFirstTurnCacheCreate: number;
}

/** An agent that read a lot and wrote almost nothing. */
export interface LowYieldAgentRow {
  sid: string;
  run?: string;
  proj: string;
  outTokens: number;
  cacheReadTokens: number;
  /** outTokens / cacheReadTokens. */
  yield: number;
  estCostUsd: number;
}

/** Fan-out cost: what the shared prefix and the low-yield agents cost. */
export interface FanoutSection {
  runs: Ranking<FanoutRunRow>;
  lowYield: Ranking<LowYieldAgentRow>;
  /** Agents whose first turn wrote cache, i.e. paid for a fresh prefix. */
  agentsWithFirstTurnCacheWrite: number;
  /** Sum of firstTurnCacheCreate across workflow agents. */
  totalFirstTurnCacheCreate: number;
}

/** Human turns matching one correction signal. */
export interface CorrectionBucket {
  bucket: string;
  count: number;
  /** 2-3 verbatim human turns, truncated. */
  samples: string[];
}

/** The same request made again in a different session. */
export interface RepeatedRequestCluster {
  /** Shortest turn in the cluster, used as its label. */
  label: string;
  count: number;
  sessions: number;
  samples: string[];
}

/** What the human had to say, and how often they had to say it. */
export interface HumanSection {
  humanTurnCount: number;
  interrupts: number;
  corrections: Ranking<CorrectionBucket>;
  repeatedRequests: Ranking<RepeatedRequestCluster>;
}

/** What the audit found on disk next to a project's cwd. */
export interface ProjectOnDisk {
  cwd?: string;
  claudeMd: boolean;
  agentsMd: boolean;
  settingsJson: boolean;
  packageJson: boolean;
  /** Detected from the lockfile or packageManager field. */
  packageManager?: string;
  /** Script NAMES only, never their contents. */
  scriptNames: string[];
}

/** One project, end to end. */
export interface ProjectReportRow {
  proj: string;
  sessions: number;
  totals: TokenTotals;
  estCostUsd: number;
  bashSec: number;
  topCommands: CommandFamilyRow[];
  onDisk: ProjectOnDisk;
}

/** The whole summary, printed as JSON by `--format json`. */
export interface AggregateReport {
  schemaVersion: 1;
  window: WindowSection;
  tokens: TokensSection;
  wallClock: WallClockSection;
  commands: CommandsSection;
  errors: ErrorsSection;
  context: ContextSection;
  web: WebSection;
  fanout: FanoutSection;
  human: HumanSection;
  projects: Ranking<ProjectReportRow>;
}
