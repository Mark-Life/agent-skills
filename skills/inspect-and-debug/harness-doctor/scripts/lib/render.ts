/**
 * Renders the aggregate report as compact markdown, for a model to read.
 *
 * Dense tables, numbers with units, no decoration. Every table states how many rows
 * it dropped, so a truncated ranking can never read as a complete one. The whole
 * summary stays near 400 lines: rankings are capped again at render time.
 */

import { cell, int, pct, plural, sec, table, tok, usd } from "./format.ts";
import { cmpStr } from "./stats.ts";
import type { AggregateReport, Ranking, SessionKind, TokenTotals } from "./types.ts";

/** How the summary is rendered. */
export interface RenderOptions {
  /** Rows per table. Clamped to 25: the summary is a briefing, not a data dump. */
  top?: number;
  /** Printed as the last line when set, so a caller can find the fact tables. */
  workDir?: string;
}

/** Hard cap on rows per table, whatever `--top` says. */
const MAX_ROWS = 25;

/** Rows to render from a ranking, after the render-time cap. */
const take = <T>(r: Ranking<T>, limit: number) => r.rows.slice(0, limit);

/**
 * One line saying what a table left out, counting both the aggregate cap and the
 * render cap. Returns an empty list when every row is on screen.
 */
const dropped = <T>(r: Ranking<T>, limit: number) => {
  const shown = Math.min(r.rows.length, limit);
  const hidden = r.total - shown;
  return hidden > 0 ? [`${shown} of ${int(r.total)} rows, ${int(hidden)} not shown.`] : [];
};

/** A ranked table plus its dropped-rows line. */
const ranked = <T>(
  r: Ranking<T>,
  limit: number,
  headers: readonly string[],
  row: (x: T) => (string | number)[],
) => [...table(headers, take(r, limit).map(row)), ...dropped(r, limit)];

/** Token totals as a one-line "in / out / read / write" string. */
const totalsLine = (t: TokenTotals) =>
  `in ${tok(t.in)}, out ${tok(t.out)}, cacheRead ${tok(t.cacheRead)}, cacheWrite ${tok(t.cacheCreate)}`;

/** Sum of every token class in a totals block. */
const allTokens = (t: TokenTotals) => t.in + t.out + t.cacheRead + t.cacheCreate;

/** Session kinds in fixed order. */
const KINDS: readonly SessionKind[] = ["main", "subagent", "workflow-agent"];

/** Record entries sorted by value descending, then key, capped. */
const byValue = (rec: Record<string, number>, limit: number) =>
  Object.entries(rec)
    .sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))
    .slice(0, limit);

/** Window and the numbers worth reading first. */
const headline = (r: AggregateReport) => {
  const w = r.window;
  const kinds = KINDS.map((k) => `${k} ${int(w.sessionsByKind[k] ?? 0)}`).join(", ");
  const flail = r.commands.flagFlailing;
  const retry = r.errors.retryLoops;
  const corrections = r.human.corrections;
  const correctionCount = corrections.rows.reduce((a, b) => a + b.count, 0);
  return [
    "# harness audit",
    "",
    `Window ${w.days}d, ${w.fromIso || "unknown"} to ${w.toIso || "unknown"}. Files scanned ${int(w.filesScanned)}, skipped ${int(w.filesSkipped)}. Sessions: ${kinds}. Projects ${int(w.projectCount)}.`,
    "",
    "## headline",
    "",
    ...table(
      ["metric", "value"],
      [
        ["tokens total", tok(allTokens(r.tokens.totals))],
        ["estimated cost", usd(r.tokens.estCostUsd)],
        ["tool wall-clock (approx)", sec(r.wallClock.totalToolSec)],
        [
          "bash seconds",
          sec(r.wallClock.byTool.rows.find((t) => t.tool === "Bash")?.totalSec ?? 0),
        ],
        [
          "commands re-run in-session",
          `${plural(r.commands.repeatsInSession.rows.reduce((a, b) => a + b.occurrences, 0), "repeat")} over ${plural(r.commands.repeatsInSession.total, "command")}`,
        ],
        [
          "flag flailing",
          `${plural(flail.rows.reduce((a, b) => a + b.occurrences, 0), "distinct command")} across ${plural(flail.total, "bin")}`,
        ],
        [
          "retry loops",
          `${plural(retry.rows.reduce((a, b) => a + b.count, 0), "loop")} over ${plural(retry.total, "family", "families")}`,
        ],
        ["web repeat rate", `${pct(r.web.repeatRate)} of ${int(r.web.totalCalls)} calls`],
        [
          "fan-out prefix rewritten",
          `${tok(r.fanout.totalFirstTurnCacheCreate)} cacheWrite on first turns, ${int(r.fanout.agentsWithFirstTurnCacheWrite)} agents`,
        ],
        [
          "human corrections",
          `${int(correctionCount)} bucket hits over ${int(r.human.humanTurnCount)} human turns`,
        ],
        ["interrupts", int(r.human.interrupts)],
      ],
    ),
    "",
  ];
};

/** Tokens by kind, model, and project, with the cost estimate. */
const tokensBlock = (r: AggregateReport, limit: number) => {
  const t = r.tokens;
  const unpriced =
    t.unpricedModels.length > 0
      ? [`Unpriced model ids, charged at sonnet rates: ${t.unpricedModels.join(", ")}.`]
      : ["Every model id matched a priced family."];
  return [
    "## tokens",
    "",
    `Totals: ${totalsLine(t.totals)}. Estimated cost ${usd(t.estCostUsd)}.`,
    "",
    ...table(
      ["kind", "in", "out", "cacheRead", "cacheWrite"],
      KINDS.map((k) => {
        const v = t.byKind[k] ?? { in: 0, out: 0, cacheRead: 0, cacheCreate: 0 };
        return [k, tok(v.in), tok(v.out), tok(v.cacheRead), tok(v.cacheCreate)];
      }),
    ),
    "",
    "By model, tokens attributed in proportion to model calls per session:",
    "",
    ...table(
      ["model", "in", "out", "cacheRead", "cacheWrite"],
      Object.entries(t.byModel)
        .sort((a, b) => allTokens(b[1]) - allTokens(a[1]) || cmpStr(a[0], b[0]))
        .slice(0, limit)
        .map(([model, v]) => [
          model,
          tok(v.in),
          tok(v.out),
          tok(v.cacheRead),
          tok(v.cacheCreate),
        ]),
    ),
    "",
    ...ranked(
      t.byProject,
      limit,
      ["project", "sessions", "tokens", "cacheRead", "est cost"],
      (p) => [
        p.proj,
        int(p.sessions),
        tok(allTokens(p.totals)),
        tok(p.totals.cacheRead),
        usd(p.estCostUsd),
      ],
    ),
    "",
    ...unpriced,
    t.note,
    "",
  ];
};

/** Wall-clock by tool and project. */
const wallClockBlock = (r: AggregateReport, limit: number) => [
  "## wall clock",
  "",
  `Total tool time ${sec(r.wallClock.totalToolSec)}. ${r.wallClock.note}`,
  "",
  ...ranked(
    r.wallClock.byTool,
    limit,
    ["tool", "calls", "total", "median", "p95", "err"],
    (x) => [x.tool, int(x.calls), sec(x.totalSec), sec(x.medianSec), sec(x.p95Sec), pct(x.errRate)],
  ),
  "",
  ...ranked(r.wallClock.byProject, limit, ["project", "calls", "total"], (x) => [
    x.proj,
    int(x.calls),
    sec(x.totalSec),
  ]),
  "",
];

/** Command families, repeats, and flag flailing. */
const commandsBlock = (r: AggregateReport, limit: number) => [
  "## commands",
  "",
  ...ranked(
    r.commands.byTotalSec,
    limit,
    ["family", "bin", "calls", "total", "median", "p95", "err"],
    (x) => [
      x.family,
      x.bin,
      int(x.count),
      sec(x.totalSec),
      sec(x.medianSec),
      sec(x.p95Sec),
      pct(x.errRate),
    ],
  ),
  "",
  "Most-run families:",
  "",
  ...ranked(r.commands.byCount, limit, ["family", "calls", "total", "err"], (x) => [
    x.family,
    int(x.count),
    sec(x.totalSec),
    pct(x.errRate),
  ]),
  "",
  "Identical command re-run inside one session, counting every run after the first:",
  "",
  ...ranked(
    r.commands.repeatsInSession,
    limit,
    ["command", "repeats", "sessions", "wasted"],
    (x) => [x.cmd, int(x.occurrences), int(x.sessions), sec(x.wastedSec)],
  ),
  "",
  "Flag flailing: same binary, 4 or more distinct normalised commands inside 10 minutes of one session.",
  "",
  ...ranked(
    r.commands.flagFlailing,
    limit,
    ["bin", "distinct cmds", "sessions", "total", "sample"],
    (x) => [
      x.bin,
      int(x.occurrences),
      int(x.sessions),
      sec(x.totalSec),
      x.sampleCmds.slice(0, 2).join(" ; "),
    ],
  ),
  "",
];

/** Error clusters, missing binaries, refusals, and retry loops. */
const errorsBlock = (r: AggregateReport, limit: number) => [
  "## errors",
  "",
  ...ranked(
    r.errors.clusters,
    limit,
    ["signature", "count", "sessions", "top tool", "sample"],
    (x) => [x.sig, int(x.count), int(x.sessionCount), x.topTool, x.sampleMsg],
  ),
  "",
  "Binaries the shell could not find:",
  "",
  ...ranked(r.errors.missingBinaries, limit, ["bin", "count", "sessions", "sample"], (x) => [
    x.bin,
    int(x.count),
    int(x.sessions),
    x.sampleMsg,
  ]),
  "",
  "Refused calls:",
  "",
  ...ranked(r.errors.permissionDenied, limit, ["target", "count", "sessions", "sample"], (x) => [
    x.target,
    int(x.count),
    int(x.sessions),
    x.sampleMsg,
  ]),
  "",
  "Retry loops: a command re-run within 5 minutes of failing.",
  "",
  ...ranked(
    r.errors.retryLoops,
    limit,
    ["family", "loops", "median retries", "sessions", "sample"],
    (x) => [x.family, int(x.count), x.medianRetries.toFixed(1), int(x.sessions), x.sampleCmd],
  ),
  "",
];

/** Context pressure: peak sessions, big outputs, re-reads, cache write ratio. */
const contextBlock = (r: AggregateReport, limit: number) => {
  const shown = take(r.context.topSessions, limit);
  const shownRead = shown.reduce((a, s) => a + s.cacheReadTokens, 0);
  const share = r.tokens.totals.cacheRead > 0 ? shownRead / r.tokens.totals.cacheRead : 0;
  return [
    "## context",
    "",
    `The ${shown.length} sessions with the largest peak context hold ${pct(share)} of all cache-read tokens (${tok(shownRead)} of ${tok(r.tokens.totals.cacheRead)}).`,
    "",
    ...ranked(
      r.context.topSessions,
      limit,
      ["session", "project", "kind", "maxCtx", "cacheRead", "est cost"],
      (x) => [
        x.sid.slice(0, 8),
        x.proj,
        x.kind,
        tok(x.maxCtx),
        tok(x.cacheReadTokens),
        usd(x.estCostUsd),
      ],
    ),
    "",
    "Single tool results that returned the most text:",
    "",
    ...ranked(r.context.bigOutputs, limit, ["tool", "arg", "chars", "tokens est"], (x) => [
      x.tool,
      x.arg ?? "",
      int(x.outChars),
      tok(x.tokensEst),
    ]),
    "",
    ...table(
      ["tool", "p95 chars"],
      byValue(r.context.p95CharsByTool, limit).map(([tool, v]) => [tool, int(v)]),
    ),
    "",
    "Same file read more than once in one session:",
    "",
    ...ranked(r.context.reReads, limit, ["file", "extra reads", "sessions", "wasted tokens"], (x) => [
      x.arg,
      int(x.occurrences),
      int(x.sessions),
      tok(x.wastedTokensEst),
    ]),
    "",
    ...table(
      ["kind", "cacheWrite share"],
      KINDS.map((k) => [k, pct(r.context.cacheWriteRatio[k] ?? 0)]),
    ),
    "",
  ];
};

/** Web traffic, repeats, and concentration by run. */
const webBlock = (r: AggregateReport, limit: number) => [
  "## web",
  "",
  `${int(r.web.totalCalls)} calls, ${sec(r.web.totalSec)}, ${tok(r.web.totalChars / 4)} tokens of text. ${pct(r.web.repeatRate)} of calls re-fetched a url or query already answered.`,
  "",
  ...table(
    ["tool", "calls", "sec", "chars"],
    Object.entries(r.web.byTool).map(([tool, s]) => [
      tool,
      int(s.calls),
      sec(s.sec),
      int(s.chars),
    ]),
  ),
  "",
  ...ranked(r.web.repeats, limit, ["tool", "url or query", "fetches", "chars", "one run"], (x) => [
    x.tool,
    x.arg,
    int(x.count),
    int(x.chars),
    x.sameRun ? "yes" : "no",
  ]),
  "",
  ...ranked(r.web.byRun, limit, ["run", "calls", "agents", "chars"], (x) => [
    x.run,
    int(x.calls),
    int(x.agents),
    int(x.chars),
  ]),
  "",
];

/** Fan-out cost per run, and agents that read a lot and wrote little. */
const fanoutBlock = (r: AggregateReport, limit: number) => [
  "## fanout",
  "",
  `${int(r.fanout.agentsWithFirstTurnCacheWrite)} agents paid for a fresh prefix on their first turn, ${tok(r.fanout.totalFirstTurnCacheCreate)} cacheWrite tokens in total.`,
  "",
  ...ranked(
    r.fanout.runs,
    limit,
    ["run", "project", "agents", "tokens", "est cost", "median first-turn write"],
    (x) => [
      x.run,
      x.proj,
      int(x.agents),
      tok(allTokens(x.totals)),
      usd(x.estCostUsd),
      tok(x.medianFirstTurnCacheCreate),
    ],
  ),
  "",
  "Low-yield agents: bottom decile of output tokens per cache-read token.",
  "",
  ...ranked(
    r.fanout.lowYield,
    limit,
    ["agent", "run", "cacheRead", "out", "yield", "est cost"],
    (x) => [
      x.sid.slice(0, 8),
      x.run ?? "",
      tok(x.cacheReadTokens),
      tok(x.outTokens),
      x.yield.toFixed(4),
      usd(x.estCostUsd),
    ],
  ),
  "",
];

/** Corrections by theme, with verbatim samples, and requests made twice. */
const humanBlock = (r: AggregateReport, limit: number) => {
  const buckets = take(r.human.corrections, limit).flatMap((b) => [
    `- ${b.bucket}: ${plural(b.count, "turn")}`,
    ...b.samples.map((s) => `  - "${cell(s, 200)}"`),
  ]);
  return [
    "## human",
    "",
    `${int(r.human.humanTurnCount)} human turns, ${int(r.human.interrupts)} interrupts. Only turns flagged as real human input are scanned: harness echoes, fenced code, and quoted lines are excluded.`,
    "",
    "Corrections by theme, a turn may match more than one theme:",
    "",
    ...(buckets.length > 0 ? buckets : ["(none)"]),
    ...dropped(r.human.corrections, limit),
    "",
    "Near-duplicate requests the human made in more than one session:",
    "",
    ...ranked(r.human.repeatedRequests, limit, ["request", "turns", "sessions"], (x) => [
      cell(x.label, 90),
      int(x.count),
      int(x.sessions),
    ]),
    "",
  ];
};

/** Per project: cost, bash time, top commands, and the rules files on disk. */
const projectsBlock = (r: AggregateReport, limit: number) => [
  "## projects",
  "",
  ...ranked(
    r.projects,
    limit,
    ["project", "sessions", "tokens", "est cost", "bash", "top commands", "on disk", "pkg"],
    (p) => [
      p.proj,
      int(p.sessions),
      tok(allTokens(p.totals)),
      usd(p.estCostUsd),
      sec(p.bashSec),
      p.topCommands
        .slice(0, 3)
        .map((c) => `${c.family} x${c.count}`)
        .join(" ; "),
      [
        p.onDisk.claudeMd ? "CLAUDE.md" : "",
        p.onDisk.agentsMd ? "AGENTS.md" : "",
        p.onDisk.settingsJson ? "settings.json" : "",
      ]
        .filter(Boolean)
        .join(" ") || "none",
      `${p.onDisk.packageManager ?? "-"}: ${p.onDisk.scriptNames.slice(0, 6).join(",") || "-"}`,
    ],
  ),
  "",
];

/**
 * Render the whole report as markdown. Row caps apply again here, and every table
 * says how many rows it dropped, so nothing reads as complete when it is not.
 */
export const renderMarkdown = (report: AggregateReport, options: RenderOptions = {}) => {
  const limit = Math.max(1, Math.min(MAX_ROWS, Math.floor(options.top ?? 15)));
  const lines = [
    ...headline(report),
    ...tokensBlock(report, limit),
    ...wallClockBlock(report, limit),
    ...commandsBlock(report, limit),
    ...errorsBlock(report, limit),
    ...contextBlock(report, limit),
    ...webBlock(report, limit),
    ...fanoutBlock(report, limit),
    ...humanBlock(report, limit),
    ...projectsBlock(report, limit),
  ];
  if (options.workDir) lines.push(options.workDir);
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
};
