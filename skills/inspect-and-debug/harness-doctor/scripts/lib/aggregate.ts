/**
 * Turns the five fact tables into the audit report.
 *
 * Everything here is deterministic: rankings sort by their metric then by a stable
 * string key, and every Record is built with sorted keys, so two runs over the same
 * rows produce byte-identical JSON.
 */

import { commandsSection, errorsSection } from "./aggregate-commands.ts";
import { humanSection } from "./aggregate-human.ts";
import { projectsSection } from "./aggregate-projects.ts";
import { DEFAULT_PRICING, PRICING_NOTE, estimateCost, priceFor } from "./cost.ts";
import {
  bump,
  clip,
  cmpStr,
  groupBy,
  isoOf,
  median,
  percentile,
  ranking,
  round,
  safeDiv,
  sortedRecord,
  sum,
  topKey,
  uniqSorted,
} from "./stats.ts";
import type {
  AggregateOptions,
  AggregateReport,
  BashRow,
  BigOutputRow,
  ContextSection,
  ContextSessionRow,
  FactTables,
  FanoutRunRow,
  FanoutSection,
  LowYieldAgentRow,
  PriceTable,
  ProjectSecondsRow,
  ReReadRow,
  SessionKind,
  SessionRow,
  TokenTotals,
  TokensSection,
  ToolRow,
  ToolSecondsRow,
  WallClockSection,
  WebRepeatRow,
  WebRunRow,
  WebSection,
  WebToolStats,
} from "./types.ts";

/** Session kinds in fixed report order, so the JSON never reorders. */
const KINDS: readonly SessionKind[] = ["main", "subagent", "workflow-agent"];

/** The two web tools this audit tracks. */
const WEB_TOOLS = ["WebFetch", "WebSearch"] as const;

/** Chars per token, the estimate used for anything not covered by usage metadata. */
const CHARS_PER_TOKEN = 4;

/** Zeroed token totals. */
const noTotals = (): TokenTotals => ({ in: 0, out: 0, cacheRead: 0, cacheCreate: 0 });

/** Add `b` into `a` in place and return `a`. */
const addTotals = (a: TokenTotals, b: TokenTotals) => {
  a.in += b.in;
  a.out += b.out;
  a.cacheRead += b.cacheRead;
  a.cacheCreate += b.cacheCreate;
  return a;
};

/** A session's usage as TokenTotals. */
const totalsOf = (s: SessionRow): TokenTotals => ({
  in: s.inTokens,
  out: s.outTokens,
  cacheRead: s.cacheReadTokens,
  cacheCreate: s.cacheCreateTokens,
});

/** Sum token totals over sessions. */
const sumTotals = (sessions: readonly SessionRow[]) =>
  sessions.reduce((acc, s) => addTotals(acc, totalsOf(s)), noTotals());

/** Every token in a totals block, for ranking by size. */
const grandTotal = (t: TokenTotals) => t.in + t.out + t.cacheRead + t.cacheCreate;

/**
 * Split a session's tokens across the models it called, in proportion to the call
 * count per model. Usage is recorded per session, not per model, so this is an
 * attribution, not a measurement: it only matters for sessions that switched model
 * mid-run.
 */
const splitByModel = (s: SessionRow) => {
  const models = Object.keys(s.models).sort(cmpStr);
  const calls = sum(models, (m) => s.models[m] ?? 0);
  const totals = totalsOf(s);
  if (models.length === 0 || calls === 0) {
    return [{ model: "(unknown)", totals }];
  }
  return models.map((model) => {
    const share = (s.models[model] ?? 0) / calls;
    return {
      model,
      totals: {
        in: totals.in * share,
        out: totals.out * share,
        cacheRead: totals.cacheRead * share,
        cacheCreate: totals.cacheCreate * share,
      },
    };
  });
};

/** Estimated USD for one session, priced per model slice. */
const sessionCost = (s: SessionRow, pricing: PriceTable) =>
  sum(splitByModel(s), ({ model, totals }) => estimateCost({ ...totals, model }, pricing));

/** Estimated USD for a set of sessions. */
const costOf = (sessions: readonly SessionRow[], pricing: PriceTable) =>
  sum(sessions, (s) => sessionCost(s, pricing));

/** Round a totals block to whole tokens. */
const roundTotals = (t: TokenTotals): TokenTotals => ({
  in: Math.round(t.in),
  out: Math.round(t.out),
  cacheRead: Math.round(t.cacheRead),
  cacheCreate: Math.round(t.cacheCreate),
});

/** Tokens split every useful way, with the cost estimate and its price table. */
const tokensSection = (
  sessions: readonly SessionRow[],
  pricing: PriceTable,
  top: number,
): TokensSection => {
  const byModel = new Map<string, TokenTotals>();
  const unpriced = new Set<string>();
  for (const s of sessions) {
    for (const { model, totals } of splitByModel(s)) {
      const acc = byModel.get(model) ?? noTotals();
      byModel.set(model, addTotals(acc, totals));
      const known = model !== "(unknown)" && priceFor(model, pricing).priced;
      if (!known && grandTotal(totals) > 0) unpriced.add(model);
    }
  }
  const byKind = KINDS.map(
    (kind) =>
      [kind, roundTotals(sumTotals(sessions.filter((s) => s.kind === kind)))] as const,
  );
  const projects = [...groupBy(sessions, (s) => s.proj)].map(([proj, rows]) => ({
    proj,
    totals: roundTotals(sumTotals(rows)),
    estCostUsd: round(costOf(rows, pricing), 4),
    sessions: rows.length,
  }));
  return {
    totals: roundTotals(sumTotals(sessions)),
    byModel: sortedRecord([...byModel].map(([m, t]) => [m, roundTotals(t)] as const)),
    byKind: sortedRecord(byKind) as Record<SessionKind, TokenTotals>,
    byProject: ranking(projects, (r) => grandTotal(r.totals), (r) => r.proj, top),
    estCostUsd: round(costOf(sessions, pricing), 2),
    pricing,
    unpricedModels: uniqSorted(unpriced),
    note: PRICING_NOTE,
  };
};

/** Bash rows viewed as tool rows, so wall-clock and big outputs cover them too. */
const bashAsTools = (bash: readonly BashRow[]): ToolRow[] =>
  bash.map((b) => ({
    sid: b.sid,
    proj: b.proj,
    kind: b.kind,
    t: b.t,
    tool: "Bash",
    durSec: b.durSec,
    err: b.err,
    outChars: b.outChars,
    arg: clip(b.cmd, 200),
    side: b.side,
  }));

/**
 * Tool rows plus bash rows, without double counting: bash rows are folded in only
 * when the tools table does not already carry Bash calls.
 */
const allToolRows = (tools: readonly ToolRow[], bash: readonly BashRow[]) =>
  tools.some((r) => r.tool === "Bash") ? [...tools] : [...tools, ...bashAsTools(bash)];

/** Seconds attributed to tool calls, by tool and by project. */
const wallClockSection = (rows: readonly ToolRow[], top: number): WallClockSection => {
  const byTool: ToolSecondsRow[] = [...groupBy(rows, (r) => r.tool)].map(
    ([tool, group]) => {
      const secs = group.map((r) => r.durSec ?? 0);
      return {
        tool,
        calls: group.length,
        totalSec: round(sum(secs, (s) => s), 1),
        medianSec: round(median(secs), 2),
        p95Sec: round(percentile(secs, 0.95), 2),
        errRate: round(safeDiv(group.filter((r) => r.err).length, group.length), 4),
      };
    },
  );
  const byProject: ProjectSecondsRow[] = [...groupBy(rows, (r) => r.proj)].map(
    ([proj, group]) => ({
      proj,
      calls: group.length,
      totalSec: round(sum(group, (r) => r.durSec ?? 0), 1),
    }),
  );
  return {
    totalToolSec: round(sum(rows, (r) => r.durSec ?? 0), 1),
    byTool: ranking(byTool, (r) => r.totalSec, (r) => r.tool, top),
    byProject: ranking(byProject, (r) => r.totalSec, (r) => r.proj, top),
    note: "durSec is the gap between a tool call and its result: it includes harness overhead, model thinking between blocks, and any wait for approval. Treat it as an upper bound on real tool time.",
  };
};

/** What filled the context window, and what refilled it. */
const contextSection = (
  sessions: readonly SessionRow[],
  rows: readonly ToolRow[],
  pricing: PriceTable,
  top: number,
): ContextSection => {
  const topSessions: ContextSessionRow[] = sessions.map((s) => ({
    sid: s.sid,
    proj: s.proj,
    kind: s.kind,
    maxCtx: s.maxCtx,
    cacheReadTokens: s.cacheReadTokens,
    cacheCreateTokens: s.cacheCreateTokens,
    estCostUsd: round(sessionCost(s, pricing), 4),
  }));
  const bigOutputs: BigOutputRow[] = rows
    .filter((r) => r.outChars > 0)
    .map((r) => ({
      sid: r.sid,
      proj: r.proj,
      tool: r.tool,
      ...(r.arg === undefined ? {} : { arg: clip(r.arg, 200) }),
      outChars: r.outChars,
      tokensEst: Math.round(r.outChars / CHARS_PER_TOKEN),
    }));
  const p95Chars = [...groupBy(rows, (r) => r.tool)].map(
    ([tool, group]) =>
      [tool, Math.round(percentile(group.map((r) => r.outChars), 0.95))] as const,
  );
  const perArg = new Map<string, { occurrences: number; sessions: Set<string>; chars: number }>();
  const reads = rows.filter((r) => r.tool === "Read" && r.arg);
  for (const [, group] of groupBy(reads, (r) => `${r.sid} ${r.arg ?? ""}`)) {
    if (group.length < 2) continue;
    const first = group[0];
    if (!first?.arg) continue;
    const entry = perArg.get(first.arg) ?? {
      occurrences: 0,
      sessions: new Set<string>(),
      chars: 0,
    };
    entry.occurrences += group.length - 1;
    entry.sessions.add(first.sid);
    entry.chars += sum(group.slice(1), (r) => r.outChars);
    perArg.set(first.arg, entry);
  }
  const reReads: ReReadRow[] = [...perArg].map(([arg, e]) => ({
    arg: clip(arg, 200),
    occurrences: e.occurrences,
    sessions: e.sessions.size,
    wastedTokensEst: Math.round(e.chars / CHARS_PER_TOKEN),
  }));
  const cacheWriteRatio = KINDS.map((kind) => {
    const group = sessions.filter((s) => s.kind === kind);
    const create = sum(group, (s) => s.cacheCreateTokens);
    const read = sum(group, (s) => s.cacheReadTokens);
    return [kind, round(safeDiv(create, create + read), 4)] as const;
  });
  return {
    topSessions: ranking(topSessions, (r) => r.maxCtx, (r) => r.sid, top),
    bigOutputs: ranking(
      bigOutputs,
      (r) => r.outChars,
      (r) => `${r.tool} ${r.arg ?? ""} ${r.sid}`,
      top,
    ),
    p95CharsByTool: sortedRecord(p95Chars),
    reReads: ranking(reReads, (r) => r.wastedTokensEst, (r) => r.arg, top),
    cacheWriteRatio: sortedRecord(cacheWriteRatio) as Record<SessionKind, number>,
  };
};

/** WebFetch and WebSearch: volume, repeats, and which runs they concentrated in. */
const webSection = (
  tools: readonly ToolRow[],
  runBySid: ReadonlyMap<string, string>,
  top: number,
): WebSection => {
  const web = tools.filter((r) => (WEB_TOOLS as readonly string[]).includes(r.tool));
  const byTool = WEB_TOOLS.map((tool) => {
    const group = web.filter((r) => r.tool === tool);
    const stats: WebToolStats = {
      calls: group.length,
      sec: round(sum(group, (r) => r.durSec ?? 0), 1),
      chars: sum(group, (r) => r.outChars),
    };
    return [tool, stats] as const;
  });
  const repeats: WebRepeatRow[] = [];
  let repeatCalls = 0;
  for (const [, group] of groupBy(
    web.filter((r) => r.arg),
    (r) => `${r.tool} ${r.arg ?? ""}`,
  )) {
    if (group.length < 2) continue;
    const first = group[0];
    if (!first) continue;
    repeatCalls += group.length - 1;
    const runs = new Set(group.map((r) => runBySid.get(r.sid) ?? ""));
    repeats.push({
      tool: first.tool,
      arg: clip(first.arg ?? "", 200),
      count: group.length,
      chars: sum(group, (r) => r.outChars),
      sessions: new Set(group.map((r) => r.sid)).size,
      sameRun: runs.size === 1 && !runs.has(""),
    });
  }
  const byRun: WebRunRow[] = [...groupBy(
    web.filter((r) => runBySid.get(r.sid)),
    (r) => runBySid.get(r.sid) ?? "",
  )].map(([run, group]) => ({
    run,
    calls: group.length,
    chars: sum(group, (r) => r.outChars),
    agents: new Set(group.map((r) => r.sid)).size,
  }));
  return {
    byTool: sortedRecord(byTool),
    totalCalls: web.length,
    totalSec: round(sum(web, (r) => r.durSec ?? 0), 1),
    totalChars: sum(web, (r) => r.outChars),
    repeatRate: round(safeDiv(repeatCalls, web.length), 4),
    repeats: ranking(repeats, (r) => r.count, (r) => `${r.tool} ${r.arg}`, top),
    byRun: ranking(byRun, (r) => r.calls, (r) => r.run, top),
  };
};

/** Fan-out cost: what each workflow run spent, and which agents read without writing. */
const fanoutSection = (
  sessions: readonly SessionRow[],
  pricing: PriceTable,
  top: number,
): FanoutSection => {
  const agents = sessions.filter((s) => s.kind !== "main");
  const wf = sessions.filter((s) => s.kind === "workflow-agent" && s.run);
  const runs: FanoutRunRow[] = [...groupBy(wf, (s) => s.run ?? "")].map(
    ([run, group]) => {
      const projs = new Map<string, number>();
      for (const s of group) bump(projs, s.proj);
      return {
        run,
        proj: topKey(projs),
        agents: group.length,
        totals: roundTotals(sumTotals(group)),
        estCostUsd: round(costOf(group, pricing), 4),
        medianFirstTurnCacheCreate: Math.round(
          median(group.map((s) => s.firstTurnCacheCreate)),
        ),
      };
    },
  );
  const candidates = agents.filter((s) => s.cacheReadTokens > 0);
  const yields = candidates.map((s) => s.outTokens / s.cacheReadTokens);
  const threshold = percentile(yields, 0.1);
  const lowYield: LowYieldAgentRow[] = candidates
    .filter((s) => s.outTokens / s.cacheReadTokens <= threshold)
    .map((s) => ({
      sid: s.sid,
      ...(s.run === undefined ? {} : { run: s.run }),
      proj: s.proj,
      outTokens: s.outTokens,
      cacheReadTokens: s.cacheReadTokens,
      yield: round(s.outTokens / s.cacheReadTokens, 6),
      estCostUsd: round(sessionCost(s, pricing), 4),
    }));
  return {
    runs: ranking(runs, (r) => r.estCostUsd, (r) => r.run, top),
    lowYield: ranking(lowYield, (r) => r.cacheReadTokens, (r) => r.sid, top),
    agentsWithFirstTurnCacheWrite: agents.filter((s) => s.firstTurnCacheCreate > 0).length,
    totalFirstTurnCacheCreate: sum(wf, (s) => s.firstTurnCacheCreate),
  };
};

/** Window end: the caller's value, else the latest timestamp seen, else now. */
const resolveToEpoch = (sessions: readonly SessionRow[], given?: number) => {
  if (typeof given === "number" && given > 0) return given;
  const stamps = sessions.flatMap((s) => [s.end ?? 0, s.start ?? 0]);
  const latest = stamps.reduce((a, b) => Math.max(a, b), 0);
  return latest > 0 ? latest : Math.floor(Date.now() / 1000);
};

/**
 * Build the whole report from the fact tables. Scan counters come from `options`
 * when the caller has them, and are derived from the rows when it does not.
 */
export const aggregate = (
  rows: FactTables,
  options: AggregateOptions,
): AggregateReport => {
  const { sessions, tools, bash, userMsgs, errors } = rows;
  const pricing = options.pricing ?? DEFAULT_PRICING;
  const top = Math.max(1, Math.floor(options.top));
  const toEpoch = resolveToEpoch(sessions, options.toEpoch);
  const fromEpoch = options.fromEpoch ?? toEpoch - options.days * 86400;
  const merged = allToolRows(tools, bash);
  const runBySid = new Map<string, string>();
  for (const s of sessions) if (s.run) runBySid.set(s.sid, s.run);
  const byKind = KINDS.map(
    (kind) => [kind, sessions.filter((s) => s.kind === kind).length] as const,
  );
  return {
    schemaVersion: 1,
    window: {
      days: options.days,
      fromIso: isoOf(fromEpoch),
      toIso: isoOf(toEpoch),
      filesScanned: options.filesScanned ?? sessions.length,
      filesSkipped: options.filesSkipped ?? 0,
      sessionsByKind: sortedRecord(byKind) as Record<SessionKind, number>,
      projectCount:
        options.projectCount ?? new Set(sessions.map((s) => s.proj)).size,
    },
    tokens: tokensSection(sessions, pricing, top),
    wallClock: wallClockSection(merged, top),
    commands: commandsSection(bash, top),
    errors: errorsSection(errors, bash, top),
    context: contextSection(sessions, merged, pricing, top),
    web: webSection(tools, runBySid, top),
    fanout: fanoutSection(sessions, pricing, top),
    human: humanSection(userMsgs, sessions, top),
    projects: projectsSection(sessions, bash, top, options.checkDisk !== false, {
      totalsOf: (group) => roundTotals(sumTotals(group)),
      costOf: (group) => costOf(group, pricing),
    }),
  };
};
