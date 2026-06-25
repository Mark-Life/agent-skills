/** Assemble the self-contained HTML report from an AnalyzedSession. */
import type { AnalyzedSession, BudgetKey, SubagentRef, TimelineEvent } from "./types.ts";
import { CAT_META } from "./analyze.ts";
import { renderTimeline } from "./svg.ts";
import { CSS, JS } from "./assets.ts";
import { cap, esc, firstLine, fmt, fmtBytes, fmtDuration, fmtK, fmtPct } from "./tokens.ts";

/**
 * Classify a context-fill fraction into a health zone. The warn/bad boundary
 * sits at 0.75 by default but is pushed above the dumb-zone threshold when the
 * user sets a high `--dumb-zone`, so the warn band never collapses.
 */
const zoneOf = (frac: number, dz: number): "ok" | "warn" | "bad" => {
  const warn = dz < 0.75 ? 0.75 : (1 + dz) / 2;
  return frac < dz ? "ok" : frac < warn ? "warn" : "bad";
};

/** CSS color variable name for a health zone. */
const zoneColor = (z: "ok" | "warn" | "bad"): string =>
  z === "ok" ? "green" : z === "warn" ? "amber" : "red";

/** Map each event to the 1-based turn it belongs to (for history grouping). */
const turnNumbers = (a: AnalyzedSession): number[] => {
  const reqToTurn = new Map(a.turns.map((t, i) => [t.requestId, i + 1] as const));
  const out: number[] = [];
  let cur = 0;
  for (const e of a.events) {
    if (e.requestId && reqToTurn.has(e.requestId)) cur = reqToTurn.get(e.requestId)!;
    out.push(cur);
  }
  return out;
};

/** A key/value cell for the metadata grid (value is pre-rendered HTML). */
const metaCell = (k: string, v: string, title?: string): string =>
  `<div class="metacell"><div class="k">${esc(k)}</div><div class="v"${title ? ` title="${esc(title)}"` : ""}>${v}</div></div>`;

/** Sticky verdict header: title, gauge, jump chips, and global controls. */
const renderHeader = (a: AnalyzedSession): string => {
  const frac = a.peakContextTokens / a.contextWindow;
  const z = zoneOf(frac, a.dumbZoneFraction);
  const health = z === "ok" ? "Healthy" : z === "warn" ? "Degrading" : "Rotting";
  const cacheFrac = a.peakContextTokens ? a.peakCacheReadTokens / a.peakContextTokens : 0;
  const memTok = a.onDiskContextFiles.reduce((s, f) => s + f.tokensEst, 0);
  const big = a.biggestItems[0];

  const chip = (label: string, cls: string, jump?: string) =>
    `<span class="chip ${cls}"${jump ? ` data-jump="${jump}"` : ""}>${esc(label)}</span>`;

  const chips = [
    `<span class="chip ${z}" id="health-word">${health}</span>`,
    chip(`system+tools ${fmtK(a.systemOverheadTokens)}`, a.systemOverheadTokens / a.contextWindow > 0.15 ? "warn" : "", "budget"),
    memTok > 0 ? chip(`CLAUDE.md/mem ${fmtK(memTok)}`, memTok > 5000 ? "bad" : "", "loaded") : "",
    a.dumbZoneCrossTurn >= 0
      ? chip(`dumb zone @ turn ${a.dumbZoneCrossTurn + 1}`, "bad", "timeline")
      : chip("never crossed — healthy", "ok", "timeline"),
    a.compactionTurns.length ? chip(`${a.compactionTurns.length} compaction(s)`, "warn", "timeline") : "",
    big ? chip(`biggest: ${big.toolName ?? big.kind} ${fmtK(big.tokensEst)}`, "", "offenders") : "",
    a.subagents.length ? chip(`${a.subagents.length} subagent(s)`, "", "subagents") : "",
    chip(`cache ${fmtPct(cacheFrac)}`, "ok"),
  ].filter(Boolean).join("");

  return `<header class="sticky"><div class="hdr">
    <div class="hdr-top">
      <div class="hdr-id">
        <div class="title">${esc(a.title || "Claude Code session")}</div>
        <div class="sub"><span id="session-id" data-full="${esc(a.sessionId)}" title="click to copy">${esc(a.sessionId.slice(0, 8))}</span> · ${esc(a.models.join(", "))} · ${esc(a.cwd || "")}</div>
      </div>
      <div class="controls">
        <select id="window-select" title="context window override">
          <option value="${a.contextWindow}" selected>${fmtK(a.contextWindow)} window${a.contextWindowInferred ? " (inferred)" : ""}</option>
          <option value="200000">200K</option><option value="1000000">1M</option><option value="custom">custom…</option>
        </select>
        <button id="theme-toggle">☀ light</button>
      </div>
    </div>
    <div class="gauge">
      <div class="gauge-track"><div class="gauge-fill" id="gauge-fill" style="width:${Math.min(100, frac * 100).toFixed(1)}%;background:var(--${zoneColor(z)})"></div><div class="gauge-dz" id="gauge-dz" style="left:${(a.dumbZoneFraction * 100).toFixed(0)}%"></div></div>
      <div class="gauge-lab"><span>peak ${fmt(a.peakContextTokens)}</span><span id="gauge-pct">${fmtPct(frac)} of ${fmt(a.contextWindow)}</span></div>
    </div>
    <div class="chips">${chips}</div>
  </div></header>`;
};

/** Session metadata grid (model, peak, turns, tax, dwell, wall-clock). */
const renderMeta = (a: AnalyzedSession): string => {
  const peakZone = zoneColor(zoneOf(a.peakContextTokens / a.contextWindow, a.dumbZoneFraction));
  const cells = [
    metaCell("Model", `${esc(a.models[0] || "—")}<br><small>${fmtK(a.contextWindow)} window ${a.contextWindowInferred ? '<span class="dotted" title="model id does not flag 1M vs 200K; inferred from peak">inferred</span>' : ""}</small>`),
    metaCell("Peak context", `<span style="color:var(--${peakZone})">${fmt(a.peakContextTokens)}</span><br><small>${fmtPct(a.peakContextTokens / a.contextWindow)} of window</small>`),
    metaCell("Turns", `${a.turnCount}<br><small>${a.userMessageCount} user · ${a.toolCallCount} tool calls</small>`),
    metaCell("System+tools tax", `${fmt(a.systemOverheadTokens)}<br><small class="dotted" title="first-turn context minus visible loads; not in transcript">every-turn floor</small>`),
    metaCell("Output generated", `${fmt(a.totalOutputTokens)}<br><small>mostly retained as thinking</small>`),
    metaCell("Dumb-zone dwell", `${a.dumbZoneTurns}/${a.turnCount}<br><small>${fmtPct(a.turnCount ? a.dumbZoneTurns / a.turnCount : 0)} of turns ≥${Math.round(a.dumbZoneFraction * 100)}%</small>`),
    metaCell("Wall-clock", `${fmtDuration(a.durationMs ?? 0)}<br><small>${esc((a.startedAt || "").slice(0, 16).replace("T", " "))}</small>`),
    metaCell("Compactions", `${a.compactionTurns.length}<br><small>${a.subagents.length} subagents</small>`),
  ];
  return `<section id="meta"><h2>Session metadata</h2>
    <div class="lead">Headline numbers are ground-truth from <code>usage</code> metadata. Branch: <code>${esc(a.gitBranch || "—")}</code> · CLI ${esc(a.version || "?")}</div>
    <div class="metagrid">${cells.join("")}</div></section>`;
};

/** Context-budget centerpiece: stacked bar + sortable category table. */
const renderBudget = (a: AnalyzedSession): string => {
  const win = a.contextWindow;
  const segs = a.budget.map((s) => {
    const pctUsed = a.peakContextTokens ? (100 * s.tokens) / a.peakContextTokens : 0;
    const lab = pctUsed > 5 ? `${s.label.split(" ")[0]} ${pctUsed.toFixed(0)}%` : "";
    const hatched = s.key === "unattributed" || s.key === "system_tools";
    const bg = hatched
      ? `repeating-linear-gradient(45deg,${s.color},${s.color} 5px,transparent 5px,transparent 8px),${s.color}`
      : s.color;
    const title = `${esc(s.label)}: ${fmt(s.tokens)} (${pctUsed.toFixed(1)}% of context)`;
    return `<div class="seg" data-tok="${s.tokens}" style="flex:${s.tokens};background:${bg}" title="${title}"><span class="segt">${esc(lab)}</span></div>`;
  }).join("");
  const free = Math.max(0, win - a.peakContextTokens);

  const rows = a.budget.map((s) => {
    const pctWin = 100 * s.tokens / win;
    const pctUsed = a.peakContextTokens ? 100 * s.tokens / a.peakContextTokens : 0;
    const warn = pctUsed > 25 ? ` <span class="warnflag" title="dominates context">▲ heavy</span>` : "";
    return `<tr>
      <td><span class="sw" style="background:${s.color}"></span>${esc(s.label)}${warn}</td>
      <td class="num" data-v="${s.tokens}">${fmt(s.tokens)}</td>
      <td class="num" data-winpct="${s.tokens}">${pctWin.toFixed(pctWin < 1 ? 2 : 1)}%</td>
      <td class="num">${pctUsed.toFixed(1)}%</td>
      <td><div class="microbar"><span style="width:${pctUsed.toFixed(1)}%;background:${s.color}"></span></div></td>
    </tr>`;
  }).join("");

  return `<section id="budget"><h2>Context budget at peak</h2>
    <div class="lead">Where the <b>${fmt(a.peakContextTokens)}</b>-token peak went. <b>Thinking</b> is recovered from real <code>output_tokens</code>; hatched slices (system+tools, unattributed) are inferred — see methodology.</div>
    <div class="bzmark"><div class="l" style="left:${(a.dumbZoneFraction * 100).toFixed(0)}%"></div><div class="t" style="left:${(a.dumbZoneFraction * 100).toFixed(0)}%">${Math.round(a.dumbZoneFraction * 100)}% dumb-zone</div></div>
    <div class="budgetbar">${segs}<div class="seg free" id="bar-free" style="flex:${free}" title="free: ${fmt(free)} tokens"></div></div>
    <div class="gauge-lab"><span>0</span><span>window ${fmtK(win)}</span></div>
    <table data-sortable style="margin-top:14px"><thead><tr>
      <th data-sort="str">Category</th><th data-sort="num">Tokens</th><th data-sort="num">% window</th><th data-sort="num">% context</th><th>share</th>
    </tr></thead><tbody>${rows}</tbody></table></section>`;
};

/** Timeline section: the stacked-area context-growth SVG plus its legend. */
const renderTimelineSection = (a: AnalyzedSession): string => {
  const legend = (Object.keys(CAT_META) as BudgetKey[])
    .filter((k) => a.budget.some((b) => b.key === k))
    .map((k) => `<span><span class="sw" style="background:${CAT_META[k].color}"></span>${esc(CAT_META[k].label)}</span>`)
    .join("");
  return `<section id="timeline"><h2>Context growth timeline</h2>
    <div class="lead">Real context size (ground-truth silhouette) per turn, attributed to categories. The red band is the dumb zone (&gt;${Math.round(a.dumbZoneFraction * 100)}% of window — degradation likely).</div>
    ${renderTimeline(a)}
    <div class="legend">${legend}</div></section>`;
};

/** Loaded-artifacts section: on-disk instruction files + in-transcript listings. */
const renderLoaded = (a: AnalyzedSession): string => {
  const items = a.events.filter((e) => e.loadedCategory && ["claude-md", "skills", "agents", "tools", "mcp", "file", "ide"].includes(e.loadedCategory));
  const onDisk = a.onDiskContextFiles;

  const callouts: string[] = [];
  const memTotal = onDisk.reduce((s, f) => s + f.tokensEst, 0);
  if (memTotal > 5000) callouts.push(`<div class="callout ${memTotal > 10000 ? "bad" : ""}">Your instruction files (CLAUDE.md / AGENTS.md / memory) total <b>~${fmt(memTotal)} tokens</b> — they sit in the system+tools floor on <b>every</b> turn. Consider trimming.</div>`);
  callouts.push(`<div class="callout">~${fmt(a.systemOverheadTokens)} tokens of system prompt + tool definitions are loaded but <b>not visible in the transcript</b> (the floor below). Loading fewer MCP tools/skills shrinks it.</div>`);

  const diskRows = onDisk.map((f) =>
    `<tr><td><span class="tag">${esc(f.scope)}</span> ${esc(f.label)}</td><td class="num" data-v="${f.tokensEst}">~${fmt(f.tokensEst)}</td><td class="num">${fmtBytes(f.bytes)}</td></tr>`,
  ).join("");

  const rows = items.map((e) =>
    `<tr><td><span class="sw" style="background:${CAT_META[loadedToBudget(e.loadedCategory!)].color}"></span><a href="#evt-${e.index}" data-jump="evt-${e.index}">${esc(e.title)}</a></td>
      <td><span class="tag">${esc(e.loadedCategory)}</span></td>
      <td class="num" data-v="${e.tokensEst}">~${fmt(e.tokensEst)}</td>
      <td class="num" data-winpct="${e.tokensEst}">${(100 * e.tokensEst / a.contextWindow).toFixed(2)}%</td></tr>`,
  ).join("");

  return `<section id="loaded"><h2>Loaded artifacts</h2>
    <div class="lead">Persistent things injected into context. Click a row to jump to it in the history.</div>
    ${callouts.join("")}
    <h3 style="font-size:14px;margin:14px 0 6px;color:var(--mut)">Instruction files on disk (attributed inside the system+tools floor)</h3>
    <table data-sortable><thead><tr><th data-sort="str">File</th><th data-sort="num">~tokens</th><th data-sort="num">size</th></tr></thead><tbody>${diskRows || `<tr><td colspan=3 class="muted">none found for this cwd</td></tr>`}</tbody></table>
    <h3 style="font-size:14px;margin:18px 0 6px;color:var(--mut)">Listings &amp; files seen in transcript</h3>
    <table data-sortable><thead><tr><th data-sort="str">Artifact</th><th data-sort="str">Kind</th><th data-sort="num">~tokens</th><th data-sort="num">% window</th></tr></thead><tbody>${rows || `<tr><td colspan=4 class="muted">none</td></tr>`}</tbody></table></section>`;
};

/** Map a loaded-artifact category to its budget slice key (for swatch color). */
const loadedToBudget = (c: string): BudgetKey =>
  c === "claude-md" ? "memory" : ["skills", "agents", "tools", "mcp"].includes(c) ? "listings" : "files";

/** Biggest-individual-items table (top 25 events by estimated size). */
const renderOffenders = (a: AnalyzedSession): string => {
  const tn = turnNumbers(a);
  const rows = a.biggestItems.slice(0, 25).map((e, i) =>
    `<tr><td class="num">${i + 1}</td>
      <td><span class="evt-kind k-${e.kind}">${esc(e.toolName ?? e.kind)}</span></td>
      <td class="num"><a href="#evt-${e.index}" data-jump="evt-${e.index}">${tn[a.events.indexOf(e)] || "—"}</a></td>
      <td class="prev" style="max-width:520px">${esc(firstLine(e.preview, 140))}</td>
      <td class="num" data-v="${e.tokensEst}">${fmt(e.tokensEst)}</td>
      <td class="num" data-winpct="${e.tokensEst}">${(100 * e.tokensEst / a.contextWindow).toFixed(2)}%</td></tr>`,
  ).join("");
  return `<section id="offenders"><h2>Biggest individual items</h2>
    <div class="lead">The most expensive single events by estimated size (chars/4). Thinking blocks are excluded — their text is not stored (see timeline for thinking totals).</div>
    <table data-sortable><thead><tr><th>#</th><th data-sort="str">Type</th><th data-sort="num">Turn</th><th data-sort="str">Preview</th><th data-sort="num">~tokens</th><th data-sort="num">% window</th></tr></thead><tbody>${rows}</tbody></table></section>`;
};

/** Full instrumented transcript: collapsible events with the dumb-zone divider. */
const renderHistory = (a: AnalyzedSession): string => {
  const tn = turnNumbers(a);
  const crossEvtIdx = a.dumbZoneCrossTurn >= 0
    ? a.events.findIndex((e) => e.requestId === a.turns[a.dumbZoneCrossTurn]?.requestId)
    : -1;

  let out = "";
  a.events.forEach((e, pos) => {
    if (pos === crossEvtIdx) {
      out += `<div class="dzrule">entered dumb zone — ${Math.round(a.dumbZoneFraction * 100)}% (${fmt(a.dumbZoneFraction * a.contextWindow)} tok) crossed at turn ${a.dumbZoneCrossTurn + 1}; everything below runs in the rot zone</div>`;
    }
    if (e.kind === "system") return;
    const bodyShown = cap(e.body || "", 60000);
    const hasBody = bodyShown.trim().length > 0;
    const search = `${e.title} ${e.preview}`.slice(0, 300);
    out += `<details class="evt" id="evt-${e.index}" data-kind="${e.kind}" data-tok="${e.tokensEst}" data-err="${!!e.isError}" data-sidechain="${!!e.isSidechain}" data-search="${esc(search)}">
      <summary>
        <span class="turn">t${tn[pos] || 0}</span>
        <span class="evt-kind k-${e.kind}">${esc(e.toolName ?? e.kind)}</span>
        <span class="prev">${esc(e.preview || "(empty)")}</span>
        <span class="num mono" style="color:var(--mut)">${e.tokensEst ? "~" + fmt(e.tokensEst) : ""}</span>
      </summary>
      ${hasBody ? `<button class="copybtn">copy</button><pre>${esc(bodyShown)}</pre>` : `<pre class="muted">${e.kind === "assistant-thinking" ? "Thinking content is not stored in the transcript (only a signature). Its token cost is in the timeline 'thinking' band." : "(no content)"}</pre>`}
    </details>`;
  });

  return `<section id="history"><h2>Full history</h2>
    <div class="lead">Every transcript event in order, collapsed. Click to expand full content. ${a.dumbZoneTurns}/${a.turnCount} turns ran in the dumb zone.</div>
    <div class="filterbar">
      <input type="search" id="hist-search" placeholder="search content…">
      <select id="hist-role"><option value="">all types</option>
        <option value="user-prompt">user</option><option value="assistant-text">assistant</option>
        <option value="tool-call">tool calls</option><option value="tool-result">tool results</option>
        <option value="assistant-thinking">thinking</option><option value="attachment">attachments</option></select>
      <label class="muted">min tok <input type="number" id="hist-min" value="0"></label>
      <button data-expand-all="#history" data-label="all" data-open="0">Expand all</button>
    </div>
    ${out}</section>`;
};

/** Subagents panel — each runs in its own window (does not count against main). */
const renderSubagents = (a: AnalyzedSession): string => {
  if (!a.subagents.length) return "";
  const cards = a.subagents.map((s: SubagentRef) => {
    const frac = s.peakContextTokens / a.contextWindow;
    return `<details class="evt"><summary>
      <span class="turn">${esc(s.agentType || "agent")}</span>
      <span class="evt-kind k-attachment">${esc(s.id.slice(0, 14))}</span>
      <span class="prev">${esc(s.description || "subagent")} · ${s.turns} turns</span>
      <span class="num mono" style="color:var(--mut)">peak ${fmtK(s.peakContextTokens)}</span>
    </summary><pre>agentType: ${esc(s.agentType || "—")}
description: ${esc(s.description || "—")}
toolUseId: ${esc(s.toolUseId || "—")}
turns: ${s.turns}
peak context: ${fmt(s.peakContextTokens)} (${fmtPct(frac)} of a fresh window)
path: ${esc(s.path)}</pre></details>`;
  }).join("");
  return `<section id="subagents"><h2>Subagents (${a.subagents.length})</h2>
    <div class="lead">Each runs in its <b>own</b> context window — these tokens do <b>not</b> count against the main session above.</div>
    ${cards}</section>`;
};

/** Methodology section: prose explaining which numbers to trust. */
const renderMethodology = (a: AnalyzedSession): string =>
  `<section id="methodology"><h2>Methodology</h2>
    <div class="lead">How these numbers are derived — and which ones to trust.</div>
    <div class="prose">
      <p><strong>Headline totals</strong> are ground truth from the API <code>usage</code> metadata in each assistant turn: context size at a turn = <code>input_tokens + cache_read_input_tokens + cache_creation_input_tokens</code>; peak context = max over turns (= ${fmt(a.peakContextTokens)}).</p>
      <p><strong>Per-item sizes</strong> (budget bands, loaded inventory, offenders) are chars/4 estimates.</p>
      <p><strong>Thinking</strong> is the dominant hidden cost: thinking text is <em>not</em> stored in the transcript (only a signature). We recover it as retained thinking = Σ&nbsp;output_tokens − Σ&nbsp;visible(text + tool_use). That is why the thinking band is large yet accurate.</p>
      <p><strong>System + tools residual</strong> (${fmt(a.systemOverheadTokens)}) = first-turn real context − visible loads at turn 0. It is the fixed floor (system prompt + tool schemas + global CLAUDE.md), not in the transcript; the instruction-files table attributes part of it from disk.</p>
      <p><strong>Unattributed</strong> = real peak − everything above. Mostly tool-definition schemas that grow as tools are searched/loaded, per-turn reminders, and tokenizer/encoding overhead. A large value means tool bloat.</p>
      <p><strong>Context window</strong> = ${fmt(a.contextWindow)}${a.contextWindowInferred ? " (inferred: peak &gt; 200K ⇒ 1M, else 200K — override with --window or the header select)" : " (explicit)"}. <strong>Dumb zone</strong> = ${Math.round(a.dumbZoneFraction * 100)}% of the window, a context-degradation heuristic.</p>
      <p class="muted">Note: the header window-override recomputes percentages and the gauge live; the timeline SVG is drawn for the generation-time window — regenerate with <code>--window N</code> for an authoritative redraw. Source: <code>${esc(a.path)}</code></p>
    </div></section>`;

/** Build the complete HTML document string. */
export const renderReport = (a: AnalyzedSession): string => {
  const data = {
    peak: a.peakContextTokens,
    window: a.contextWindow,
    dumbFraction: a.dumbZoneFraction,
  };
  const dataJson = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en" data-theme="dark"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.title || a.sessionId)} · context report</title>
<style>${CSS}</style></head><body>
${renderHeader(a)}
<div class="wrap">
${renderMeta(a)}
${renderBudget(a)}
${renderTimelineSection(a)}
${renderLoaded(a)}
${renderOffenders(a)}
${renderHistory(a)}
${renderSubagents(a)}
${renderMethodology(a)}
<footer>Generated by <a href="https://github.com/Mark-Life/agent-skills/tree/main/skills/session-report" target="_blank" rel="noopener">session-report</a> · ${esc(a.provider)} · ${esc(a.sessionId)} · created by <a href="https://andrey-markin.com" target="_blank" rel="noopener">andrey-markin.com</a></footer>
</div>
<script>window.__CTX__=${dataJson};</script>
<script>${JS}</script>
</body></html>`;
};
