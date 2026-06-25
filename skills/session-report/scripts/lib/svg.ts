/** Server-rendered inline-SVG stacked-area context-growth timeline. */
import type { AnalyzedSession, BudgetKey } from "./types.ts";
import { CAT_META } from "./analyze.ts";
import { esc, fmtK } from "./tokens.ts";

/** Floor -> top stacking order; shared with the client-side timeline redraw. */
export const STACK_ORDER: BudgetKey[] = [
  "system_tools", "listings", "memory", "files", "prompts",
  "tool_results", "assistant_text", "thinking", "other", "unattributed",
];

/** Fixed plot geometry (viewBox + margins); shared with the client redraw. */
export const TL_GEOM = { W: 1000, H: 440, L: 76, R: 18, T: 22, B: 46 } as const;

/** Build the timeline SVG markup for an analyzed session. */
export const renderTimeline = (a: AnalyzedSession): string => {
  const { W, H, L, R, T, B } = TL_GEOM;
  const plotW = W - L - R, plotH = H - T - B;
  const snaps = a.snapshots;
  const n = snaps.length;
  if (n === 0) return `<p class="muted">No turns with usage metadata to plot.</p>`;
  const win = a.contextWindow;

  const x = (i: number): number => (n <= 1 ? L + plotW / 2 : L + (i / (n - 1)) * plotW);
  const y = (tok: number): number => T + plotH - (Math.min(Math.max(tok, 0), win) / win) * plotH;
  const px = (v: number) => v.toFixed(1);

  // Stacked-area paths, floor -> top.
  let running = new Array<number>(n).fill(0);
  const areas: string[] = [];
  const areaPath = (upper: number[], lower: number[]): string => {
    const top = upper.map((v, i) => `${px(x(i))} ${px(y(v))}`).join(" L ");
    let d = `M ${top}`;
    for (let i = n - 1; i >= 0; i--) d += ` L ${px(x(i))} ${px(y(lower[i]))}`;
    return `${d} Z`;
  };
  for (const key of STACK_ORDER) {
    const lower = running.slice();
    const upper = running.map((lo, i) => lo + (snaps[i].slices[key] ?? 0));
    const hatch = key === "unattributed" || key === "system_tools";
    areas.push(
      `<path d="${areaPath(upper, lower)}" fill="${hatch ? `url(#hatch-${key})` : CAT_META[key].color}" fill-opacity="${hatch ? 1 : 0.82}" stroke="none"><title>${esc(CAT_META[key].label)}</title></path>`,
    );
    running = upper;
  }

  // True-total silhouette over the stack.
  const silhouette =
    `M ` + snaps.map((s, i) => `${px(x(i))} ${px(y(s.ctx))}`).join(" L ");

  // Gridlines + y labels at 0/25/50/75/100% of window.
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const yy = y(f * win);
    return `<line x1="${L}" y1="${px(yy)}" x2="${W - R}" y2="${px(yy)}" class="tl-grid"/>` +
      `<text x="${L - 8}" y="${px(yy + 4)}" class="tl-ylab">${fmtK(f * win)}</text>`;
  }).join("");

  // Dumb-zone danger band (context above the threshold) + boundary line.
  const dzY = y(a.dumbZoneFraction * win);
  const band =
    `<rect x="${L}" y="${px(T)}" width="${plotW}" height="${px(dzY - T)}" fill="rgba(248,81,73,0.09)"/>` +
    `<line x1="${L}" y1="${px(dzY)}" x2="${W - R}" y2="${px(dzY)}" class="tl-dz"/>` +
    `<text x="${W - R}" y="${px(dzY - 6)}" class="tl-dzlab">DUMB ZONE · ${Math.round(a.dumbZoneFraction * 100)}% = ${fmtK(a.dumbZoneFraction * win)}</text>`;

  // 200K ceiling ghost line for 1M-window sessions.
  const ghost = win > 200_000
    ? `<line x1="${L}" y1="${px(y(200_000))}" x2="${W - R}" y2="${px(y(200_000))}" class="tl-ghost"/>` +
      `<text x="${L + 4}" y="${px(y(200_000) - 5)}" class="tl-ghostlab">200K-model ceiling</text>`
    : "";

  // x ticks (~10).
  const step = Math.max(1, Math.ceil(n / 10));
  let ticks = "";
  for (let i = 0; i < n; i += step) {
    ticks += `<line x1="${px(x(i))}" y1="${px(T + plotH)}" x2="${px(x(i))}" y2="${px(T + plotH + 4)}" class="tl-grid"/>` +
      `<text x="${px(x(i))}" y="${px(T + plotH + 18)}" class="tl-xlab">${i + 1}</text>`;
  }

  // Compaction cliffs.
  const compaction = a.compactionTurns.map((ti) =>
    `<line x1="${px(x(ti))}" y1="${px(T)}" x2="${px(x(ti))}" y2="${px(T + plotH)}" class="tl-compact"/>` +
    `<text x="${px(x(ti))}" y="${px(T + 10)}" class="tl-compactlab">✂ compaction</text>`,
  ).join("");

  // Dumb-zone first crossing.
  const cross = a.dumbZoneCrossTurn >= 0
    ? `<line x1="${px(x(a.dumbZoneCrossTurn))}" y1="${px(T)}" x2="${px(x(a.dumbZoneCrossTurn))}" y2="${px(T + plotH)}" class="tl-cross"/>` +
      `<circle cx="${px(x(a.dumbZoneCrossTurn))}" cy="${px(y(snaps[a.dumbZoneCrossTurn]?.ctx ?? 0))}" r="4" class="tl-crossdot"/>` +
      `<text x="${px(x(a.dumbZoneCrossTurn) + 5)}" y="${px(T + plotH - 6)}" class="tl-crosslab">entered @ turn ${a.dumbZoneCrossTurn + 1}</text>`
    : "";

  // Peak marker.
  const peakX = x(a.peakTurnIndex), peakY = y(a.peakContextTokens);
  const peak =
    `<path d="M ${px(peakX)} ${px(peakY - 6)} L ${px(peakX + 6)} ${px(peakY)} L ${px(peakX)} ${px(peakY + 6)} L ${px(peakX - 6)} ${px(peakY)} Z" class="tl-peak"/>` +
    `<text x="${px(peakX)}" y="${px(peakY - 10)}" class="tl-peaklab" text-anchor="middle">peak ${fmtK(a.peakContextTokens)}</text>`;

  // Per-turn delta dots sized by output tokens.
  const dots = snaps.map((s, i) =>
    `<circle cx="${px(x(i))}" cy="${px(y(s.ctx))}" r="${Math.min(4, 1 + s.outputTokens / 6000).toFixed(1)}" class="tl-dot"/>`,
  ).join("");

  const defs =
    `<defs>` +
    [["unattributed", "#484f58"], ["system_tools", "#6e7681"]].map(([k, c]) =>
      `<pattern id="hatch-${k}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="6" height="6" fill="${c}" fill-opacity="0.5"/>` +
      `<line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.45)" stroke-width="2"/></pattern>`,
    ).join("") +
    `</defs>`;

  return (
    `<svg id="timeline-svg" viewBox="0 0 ${W} ${H}" class="timeline" role="img" aria-label="Context growth over turns" preserveAspectRatio="xMidYMid meet">` +
    defs + band + ghost + grid +
    areas.join("") +
    `<path d="${silhouette}" class="tl-silhouette"/>` +
    dots + compaction + cross + peak + ticks +
    `</svg>`
  );
};
