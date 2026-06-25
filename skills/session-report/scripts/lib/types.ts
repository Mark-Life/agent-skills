/** Shared types for the session-context report generator. */

/** Which agent CLI produced the transcript. */
export type Provider = "claude-code" | "codex";

/** A raw JSONL line, untyped. */
export type RawLine = Record<string, unknown>;

/** High-level classification of a single timeline event. */
export type EventKind =
  | "user-prompt"
  | "assistant-text"
  | "assistant-thinking"
  | "tool-call"
  | "tool-result"
  | "attachment"
  | "system"
  | "compaction"
  | "summary"
  | "meta";

/**
 * Category an attachment / loaded artifact contributes to in the context budget.
 * `null` means the event is not a persistent context-loading artifact.
 */
export type LoadedCategory =
  | "claude-md"
  | "skills"
  | "agents"
  | "tools"
  | "mcp"
  | "file"
  | "memory"
  | "ide"
  | "reminder"
  | "other";

/** One ordered entry in the reconstructed session timeline. */
export interface TimelineEvent {
  /** Position in the original JSONL (0-based). */
  index: number;
  kind: EventKind;
  ts?: string;
  /** Groups assistant content blocks belonging to the same model call. */
  requestId?: string;
  isSidechain?: boolean;
  /** Short one-line label, e.g. "Bash" or "skill_listing". */
  title: string;
  /** First line / truncated summary for the collapsed view. */
  preview: string;
  /** Full content for the expanded view (already plain text). */
  body: string;
  /** chars/4 estimate of `body` size in tokens. */
  tokensEst: number;
  isError?: boolean;
  toolName?: string;
  toolUseId?: string;
  attachmentType?: string;
  /** Set when this event loads persistent context (CLAUDE.md, skills, ...). */
  loadedCategory?: LoadedCategory;
}

/** One model call (grouped by requestId), carrying ground-truth usage. */
export interface Turn {
  requestId: string;
  ts?: string;
  model: string;
  /** input + cache_read + cache_creation = total prompt tokens sent. */
  contextTokens: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  /** Indexes into the events array belonging to this turn. */
  eventIndexes: number[];
}

/** A spawned subagent transcript discovered on disk. */
export interface SubagentRef {
  id: string;
  agentType?: string;
  description?: string;
  toolUseId?: string;
  path: string;
  turns: number;
  peakContextTokens: number;
}

/** Parsed-but-not-yet-analyzed session. */
export interface ParsedSession {
  provider: Provider;
  sessionId: string;
  path: string;
  cwd?: string;
  gitBranch?: string;
  title?: string;
  version?: string;
  models: string[];
  startedAt?: string;
  endedAt?: string;
  events: TimelineEvent[];
  turns: Turn[];
  /** event indexes that are compaction boundaries. */
  compactionIndexes: number[];
  subagents: SubagentRef[];
  /** Codex-only: model_context_window straight from token_count events. */
  declaredContextWindow?: number;
}

/** A CLAUDE.md / AGENTS.md / memory file read from disk for residual attribution. */
export interface OnDiskContextFile {
  label: string;
  path: string;
  bytes: number;
  tokensEst: number;
  scope: "global" | "project" | "memory";
}

/** Fixed set of context-budget category keys (stacking order, floor -> top). */
export type BudgetKey =
  | "system_tools"
  | "listings"
  | "memory"
  | "files"
  | "prompts"
  | "tool_results"
  | "assistant_text"
  | "thinking"
  | "other"
  | "unattributed";

/** One slice of the context-budget breakdown. */
export interface BudgetSlice {
  key: BudgetKey;
  label: string;
  tokens: number;
  color: string;
  /** true when the value is a chars/4 estimate rather than ground-truth usage. */
  estimated: boolean;
  note?: string;
}

/** Per-turn category attribution for the stacked-area timeline. */
export interface TurnSnapshot {
  turnIndex: number;
  ts?: string;
  model: string;
  ctx: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** category key -> token estimate, summing (with unattributed) to ctx. */
  slices: Record<BudgetKey, number>;
}

/** Fully analyzed session, ready to render. */
export interface AnalyzedSession extends ParsedSession {
  contextWindow: number;
  contextWindowInferred: boolean;
  peakContextTokens: number;
  peakTurnIndex: number;
  finalContextTokens: number;
  totalOutputTokens: number;
  /** baseline first-turn context minus visible loaded content. */
  systemOverheadTokens: number;
  durationMs?: number;
  /** Context-budget breakdown at the peak turn (slices sum to peakContextTokens). */
  budget: BudgetSlice[];
  /** Per-turn attribution for the stacked-area timeline. */
  snapshots: TurnSnapshot[];
  onDiskContextFiles: OnDiskContextFile[];
  /** turn index where context first crosses dumbZoneFraction of the window, or -1. */
  dumbZoneCrossTurn: number;
  dumbZoneFraction: number;
  /** turns spent at or above the dumb-zone threshold. */
  dumbZoneTurns: number;
  /** turn indexes at which a context compaction occurred. */
  compactionTurns: number[];
  /** largest single context-loading / content events, biggest first. */
  biggestItems: TimelineEvent[];
  turnCount: number;
  userMessageCount: number;
  toolCallCount: number;
  peakCacheReadTokens: number;
}
