/**
 * Turn a ParsedSession into an AnalyzedSession: context-budget attribution,
 * per-turn snapshots for the timeline, residual, dumb-zone, biggest items.
 *
 * Key insight: the real peak context (usage metadata) is far larger than the
 * visible transcript content because retained assistant *thinking* is the
 * dominant hidden contributor and is stored as empty strings. We recover it
 * from ground-truth `output_tokens` minus visible text/tool_use, which
 * attributes ~90% of context in heavy-reasoning sessions instead of ~30%.
 */
import type {
  AnalyzedSession,
  BudgetKey,
  BudgetSlice,
  OnDiskContextFile,
  ParsedSession,
  TurnSnapshot,
} from "./types.ts";

export interface AnalyzeOptions {
  /** explicit context window override (tokens). */
  window?: number;
  /** degradation threshold as a fraction of the window (default 0.40). */
  dumbZoneFraction?: number;
  onDiskContextFiles?: OnDiskContextFile[];
}

/**
 * Display metadata per context-budget category: human label, hex color (shared
 * across budget bar, timeline, tables, legend), and whether the value is an
 * estimate vs ground truth. system_tools and unattributed render hatched.
 */
const CAT_META: Record<BudgetKey, { label: string; short: string; color: string; estimated: boolean; note?: string }> = {
  system_tools: { label: "System + tool definitions", short: "System", color: "#6e7681", estimated: true, note: "inferred floor — not in transcript" },
  listings: { label: "Skill / agent / tool listings", short: "Listings", color: "#58a6ff", estimated: true },
  memory: { label: "CLAUDE.md / AGENTS.md (in transcript)", short: "Memory", color: "#bc8cff", estimated: true },
  files: { label: "Opened files / plans", short: "Files", color: "#39c5cf", estimated: true },
  prompts: { label: "User prompts", short: "Prompts", color: "#3fb950", estimated: true },
  tool_results: { label: "Tool results", short: "Tool results", color: "#f0883e", estimated: true },
  assistant_text: { label: "Assistant text + tool calls", short: "Assistant", color: "#d29922", estimated: true },
  thinking: { label: "Assistant thinking (retained)", short: "Thinking", color: "#db61a2", estimated: true, note: "derived from output_tokens − visible text" },
  other: { label: "Other injected (reminders, hooks)", short: "Other", color: "#8a929e", estimated: true },
  unattributed: { label: "Tool schemas & overhead (not in transcript)", short: "Overhead", color: "#484f58", estimated: true, note: "real context − everything attributable above" },
};

const ZERO_SLICES = (): Record<BudgetKey, number> => ({
  system_tools: 0, listings: 0, memory: 0, files: 0, prompts: 0,
  tool_results: 0, assistant_text: 0, thinking: 0, other: 0, unattributed: 0,
});

/** Analyze a parsed session into render-ready metrics. */
export const analyze = (p: ParsedSession, opts: AnalyzeOptions = {}): AnalyzedSession => {
  const turns = p.turns;
  const dumbZoneFraction = opts.dumbZoneFraction ?? 0.4;

  let peakContextTokens = 0;
  let peakTurnIndex = 0;
  let peakCacheReadTokens = 0;
  let totalOutputTokens = 0;
  turns.forEach((t, i) => {
    totalOutputTokens += t.outputTokens;
    if (t.contextTokens > peakContextTokens) {
      peakContextTokens = t.contextTokens;
      peakTurnIndex = i;
      peakCacheReadTokens = t.cacheReadTokens;
    }
  });
  const finalContextTokens = turns.at(-1)?.contextTokens ?? 0;

  // Window precedence: explicit override > provider-declared (Codex) > default.
  // Claude Code transcripts never record the window, so assume 1M (its usual
  // default); switch to 200K via the header selector for a 200K-model session.
  const contextWindow = opts.window ?? p.declaredContextWindow ?? 1_000_000;
  const contextWindowInferred = !opts.window && !p.declaredContextWindow;

  // Per-turn estimate of visible text + tool_use (model output we *can* see).
  const ttByReq = new Map<string, number>();
  for (const e of p.events) {
    if (e.requestId && (e.kind === "assistant-text" || e.kind === "tool-call")) {
      ttByReq.set(e.requestId, (ttByReq.get(e.requestId) ?? 0) + e.tokensEst);
    }
  }

  // Residual = first-turn real context − everything visible before the first turn.
  const firstReq = turns[0]?.requestId;
  let firstTurnPos = p.events.findIndex((e) => e.requestId === firstReq);
  if (firstTurnPos < 0) firstTurnPos = p.events.length;
  let visibleAtStart = 0;
  for (let i = 0; i < firstTurnPos; i++) visibleAtStart += p.events[i].tokensEst;
  const systemOverheadTokens = Math.max(0, (turns[0]?.contextTokens ?? 0) - visibleAtStart);

  // Single ordered walk: accumulate retained content per category, snapshot each turn.
  const turnIndexByReq = new Map(turns.map((t, i) => [t.requestId, i] as const));
  const cat = ZERO_SLICES();
  cat.system_tools = systemOverheadTokens;
  let retainedThinking = 0;
  const snapshots: TurnSnapshot[] = [];
  const compactionTurns: number[] = [];
  let pendingCompaction = false;
  let lastSnapReq: string | undefined;

  const foldContent = (loadedCategory: string | undefined, kind: string, tokens: number) => {
    switch (loadedCategory) {
      case "claude-md": cat.memory += tokens; return;
      case "skills": case "agents": case "tools": case "mcp": cat.listings += tokens; return;
      case "file": case "ide": cat.files += tokens; return;
      case "reminder": case "other": cat.other += tokens; return;
    }
    if (kind === "tool-result") cat.tool_results += tokens;
    else if (kind === "user-prompt" || kind === "compaction") cat.prompts += tokens;
    else if (kind === "summary") cat.other += tokens;
  };

  // Build the per-turn slices so they ALWAYS sum to the real ctx with all >=0:
  // keep system_tools as a clamped floor, then either fit estimates under the
  // remainder (unattributed = leftover) or scale them down if they overshoot
  // (e.g. after a compaction evicts content we can no longer see).
  const makeSlices = (ctx: number): Record<BudgetKey, number> => {
    const floor = Math.min(cat.system_tools, ctx);
    const rest = Math.max(0, ctx - floor);
    const est: Record<Exclude<BudgetKey, "system_tools" | "unattributed">, number> = {
      thinking: retainedThinking,
      assistant_text: cat.assistant_text,
      tool_results: cat.tool_results,
      prompts: cat.prompts,
      memory: cat.memory,
      listings: cat.listings,
      files: cat.files,
      other: cat.other,
    };
    const estSum = Object.values(est).reduce((a, b) => a + b, 0);
    const scale = estSum > rest && estSum > 0 ? rest / estSum : 1;
    const scaled = Object.fromEntries(
      Object.entries(est).map(([k, v]) => [k, v * scale]),
    ) as typeof est;
    return {
      system_tools: floor,
      ...scaled,
      unattributed: scale < 1 ? 0 : Math.max(0, rest - estSum),
    };
  };

  for (const e of p.events) {
    if (e.requestId && turnIndexByReq.has(e.requestId)) {
      if (e.requestId !== lastSnapReq) {
        const ti = turnIndexByReq.get(e.requestId)!;
        const t = turns[ti];
        snapshots.push({
          turnIndex: ti,
          ts: t.ts,
          model: t.model,
          ctx: t.contextTokens,
          outputTokens: t.outputTokens,
          cacheReadTokens: t.cacheReadTokens,
          slices: makeSlices(t.contextTokens),
        });
        if (pendingCompaction) {
          compactionTurns.push(ti);
          pendingCompaction = false;
        }
        lastSnapReq = e.requestId;
        // This turn's output is retained for *subsequent* turns.
        const tt = ttByReq.get(e.requestId) ?? 0;
        cat.assistant_text += tt;
        retainedThinking += Math.max(0, t.outputTokens - tt);
      }
    } else if (!e.isSidechain) {
      if (e.kind === "compaction") {
        // Compaction replaces conversation history with a summary: evict the
        // growable content so attribution tracks the real (smaller) context.
        pendingCompaction = true;
        retainedThinking = 0;
        cat.assistant_text = 0;
        cat.tool_results = 0;
        cat.prompts = 0;
        cat.files = 0;
        cat.other = 0;
      }
      foldContent(e.loadedCategory, e.kind, e.tokensEst);
    }
  }

  // Budget = attribution at the peak turn.
  const peakSnap = snapshots[peakTurnIndex] ?? snapshots.at(-1);
  const budget: BudgetSlice[] = (Object.keys(CAT_META) as BudgetKey[])
    .map((key) => ({ key, ...CAT_META[key], tokens: peakSnap?.slices[key] ?? 0 }))
    .filter((s) => s.tokens > 0);

  // Dumb-zone crossing.
  const dumbZoneTokens = dumbZoneFraction * contextWindow;
  let dumbZoneCrossTurn = -1;
  let dumbZoneTurns = 0;
  turns.forEach((t, i) => {
    if (t.contextTokens >= dumbZoneTokens) {
      if (dumbZoneCrossTurn < 0) dumbZoneCrossTurn = i;
      dumbZoneTurns++;
    }
  });

  // Biggest individual items (content + loaded artifacts), largest first.
  const biggestItems = p.events
    .filter((e) => e.kind !== "system" && e.tokensEst > 0)
    .sort((a, b) => b.tokensEst - a.tokensEst)
    .slice(0, 40);

  const userMessageCount = p.events.filter((e) => e.kind === "user-prompt").length;
  const toolCallCount = p.events.filter((e) => e.kind === "tool-call").length;
  const durationMs =
    p.startedAt && p.endedAt ? new Date(p.endedAt).getTime() - new Date(p.startedAt).getTime() : undefined;

  return {
    ...p,
    contextWindow,
    contextWindowInferred,
    peakContextTokens,
    peakTurnIndex,
    finalContextTokens,
    totalOutputTokens,
    systemOverheadTokens,
    durationMs,
    budget,
    snapshots,
    onDiskContextFiles: opts.onDiskContextFiles ?? [],
    dumbZoneCrossTurn,
    dumbZoneFraction,
    dumbZoneTurns,
    compactionTurns,
    biggestItems,
    turnCount: turns.length,
    userMessageCount,
    toolCallCount,
    peakCacheReadTokens,
  };
};

export { CAT_META };
