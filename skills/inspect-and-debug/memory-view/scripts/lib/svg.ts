/** Server-rendered inline-SVG visuals for the memory-view report:
 * the MEMORY.md budget gauge, the type donut, and the simple arc link graph.
 * All interpolated text passes through esc(); colors reference the CSS palette.
 */
import type { AnalyzedVault, GraphNode, LinkEdge } from "./types.ts";
import { esc, fmtBytes } from "./tokens.ts";

/** Stable color per frontmatter `type` (shared by donut, chips, and arc nodes). */
export const TYPE_COLORS: Record<string, string> = {
  user: "var(--c-memory)",
  feedback: "var(--amber)",
  project: "var(--primary)",
  reference: "var(--c-listings)",
  unknown: "var(--c-unattributed)",
};

/** Resolve a type label to its palette color, defaulting to the unknown swatch. */
export const typeColor = (t: string): string => TYPE_COLORS[t] ?? TYPE_COLORS.unknown;

/** Documented order for type-keyed visuals. */
const TYPE_ORDER = ["user", "feedback", "project", "reference", "unknown"] as const;

/** Round to one decimal for compact SVG path coordinates. */
const px = (v: number): number => Math.round(v * 10) / 10;

/**
 * The headline visual: MEMORY.md fill against the 200-line / 25 KB cliff.
 * Renders three narratives keyed off indexBudget.kind — a real index gauge with
 * the truncation cliff and greyed below-fold zone, a "this is content not an
 * index" state for monolithic MEMORY.md, and a reassuring empty state when absent.
 */
export const renderBudgetGauge = (av: AnalyzedVault): string => {
  const b = av.indexBudget;
  const W = 1000;
  const H = 132;
  const x0 = 24;
  const capX = 620; // pixel position of the 100% (cap) cliff
  const trackY = 46;
  const trackH = 34;

  if (b.kind === "absent") {
    return `<svg viewBox="0 0 ${W} ${H}" class="mg-gauge" role="img" aria-label="No MEMORY.md index">
      <rect x="${x0}" y="${trackY}" width="${capX}" height="${trackH}" rx="8" class="gz-track gz-empty"/>
      <line x1="${x0 + capX}" y1="${trackY - 10}" x2="${x0 + capX}" y2="${trackY + trackH + 10}" class="gz-cliff"/>
      <text x="${x0 + capX + 8}" y="${trackY + 4}" class="gz-cliffLab">200 lines / 25 KB cliff</text>
      <text x="${x0}" y="32" class="gz-title">MEMORY.md index budget</text>
      <text x="${x0}" y="${trackY + trackH + 32}" class="gz-note">No MEMORY.md index in this vault — nothing to truncate. Claude auto-loads the index when present; consider adding one as the vault grows.</text>
    </svg>`;
  }

  if (b.kind === "monolithic") {
    return `<svg viewBox="0 0 ${W} ${H}" class="mg-gauge" role="img" aria-label="Monolithic MEMORY.md">
      <defs><pattern id="gz-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="var(--amber)" fill-opacity="0.18"/>
        <line x1="0" y1="0" x2="0" y2="8" stroke="var(--amber)" stroke-width="2" stroke-opacity="0.5"/></pattern></defs>
      <rect x="${x0}" y="${trackY}" width="${W - x0 * 2}" height="${trackH}" rx="8" fill="url(#gz-hatch)" stroke="var(--amber)" stroke-opacity="0.5"/>
      <text x="${x0}" y="32" class="gz-title">MEMORY.md is prose, not an index (IDX11)</text>
      <text x="${W / 2}" y="${trackY + trackH / 2 + 5}" text-anchor="middle" class="gz-monoLab">${b.lines} lines · ${fmtBytes(b.bytes)} — this is content, not a bullet index</text>
      <text x="${x0}" y="${trackY + trackH + 32}" class="gz-note">A monolithic MEMORY.md can't be re-indexed safely. Migrate facts to topic files + a generated index, or leave as a single prose note.</text>
    </svg>`;
  }

  // kind === "index"
  const lineFrac = b.maxLines ? b.lines / b.maxLines : 0;
  const byteFrac = b.maxBytes ? b.bytes / b.maxBytes : 0;
  const frac = Math.max(lineFrac, byteFrac);
  const fillW = Math.min(frac, 1) * capX;
  const overFrac = Math.max(0, frac - 1);
  const overW = Math.min(overFrac, 0.5) * capX; // clamp the overflow tail to keep it on-canvas
  const zone = frac < 0.6 ? "ok" : frac < 0.9 ? "warn" : "bad";
  const fillColor = zone === "ok" ? "var(--green)" : zone === "warn" ? "var(--amber)" : "var(--red)";

  const overRect = overW > 0
    ? `<rect x="${px(x0 + capX)}" y="${trackY}" width="${px(overW)}" height="${trackH}" class="gz-over"/>
       <text x="${px(x0 + capX + overW / 2)}" y="${trackY + trackH / 2 + 4}" text-anchor="middle" class="gz-overLab">INVISIBLE TO CLAUDE</text>`
    : "";

  const belowNote = b.belowFoldCount > 0
    ? `<text x="${x0}" y="${trackY + trackH + 32}" class="gz-note gz-bad">${b.belowFoldCount} index ${b.belowFoldCount === 1 ? "entry is" : "entries are"} past the cliff — below the fold and never read by Claude. Move important entries above the cliff or split the index.</text>`
    : `<text x="${x0}" y="${trackY + trackH + 32}" class="gz-note">Index fits inside the 200-line / 25 KB window Claude auto-loads. Headroom: ${b.maxLines - b.lines} lines · ${fmtBytes(Math.max(0, b.maxBytes - b.bytes))}.</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" class="mg-gauge" role="img" aria-label="MEMORY.md budget gauge">
    <rect x="${x0}" y="${trackY}" width="${capX}" height="${trackH}" rx="8" class="gz-track"/>
    <rect x="${x0}" y="${trackY}" width="${px(fillW)}" height="${trackH}" rx="8" fill="${fillColor}" class="gz-fill"/>
    ${overRect}
    <line x1="${x0 + capX}" y1="${trackY - 10}" x2="${x0 + capX}" y2="${trackY + trackH + 10}" class="gz-cliff"/>
    <text x="${x0 + capX + 8}" y="${trackY - 1}" class="gz-cliffLab">cliff · 200 lines / 25 KB</text>
    <text x="${x0}" y="32" class="gz-title">MEMORY.md ${b.lines}/${b.maxLines} lines · ${fmtBytes(b.bytes)}/${fmtBytes(b.maxBytes)}${b.overBudget ? " · OVER BUDGET" : ""}</text>
    ${belowNote}
  </svg>`;
};

/**
 * Donut of content-file counts by type. Returns a centered total with one
 * stroked arc segment per non-empty type; an empty muted ring when 0 files.
 */
export const renderTypeDonut = (av: AnalyzedVault): string => {
  const counts = av.typeCounts;
  const total = TYPE_ORDER.reduce((s, t) => s + (counts[t] ?? 0), 0)
    + Object.entries(counts).filter(([k]) => !TYPE_ORDER.includes(k as never)).reduce((s, [, v]) => s + v, 0);
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 64;
  const sw = 26;
  const C = 2 * Math.PI * r;

  if (total === 0) {
    return `<svg viewBox="0 0 ${size} ${size}" class="mg-donut" role="img" aria-label="No typed memories">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line2)" stroke-width="${sw}"/>
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" class="dn-zero">0 files</text>
    </svg>`;
  }

  const keys = Object.keys(counts).sort(
    (a, b2) => TYPE_ORDER.indexOf(a as never) - TYPE_ORDER.indexOf(b2 as never),
  );
  let offset = 0;
  const segs = keys.map((k) => {
    const v = counts[k] ?? 0;
    if (v <= 0) return "";
    const len = (v / total) * C;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${typeColor(k)}" stroke-width="${sw}"
      stroke-dasharray="${px(len)} ${px(C - len)}" stroke-dashoffset="${px(-offset)}"
      transform="rotate(-90 ${cx} ${cy})"><title>${esc(k)}: ${v}</title></circle>`;
    offset += len;
    return seg;
  }).join("");

  return `<svg viewBox="0 0 ${size} ${size}" class="mg-donut" role="img" aria-label="Memories by type">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="${sw}"/>
    ${segs}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="dn-total">${total}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="dn-sub">memories</text>
  </svg>`;
};

/** Node radius scaled by byte size (sqrt), clamped to a readable band. */
const nodeRadius = (bytes: number, maxBytes: number): number => {
  const f = maxBytes > 0 ? Math.sqrt(bytes / maxBytes) : 0;
  return px(6 + f * 12);
};

/**
 * Simple arc link graph: non-orphan nodes on a horizontal baseline (colored by
 * type, sized by bytes), resolved body links as arcs above, unresolved/broken
 * links as red stubs, and graph orphans parked in a right-hand gutter.
 * Returns a muted note when the vault has no files.
 */
export const renderArcGraph = (av: AnalyzedVault): string => {
  const nodes = av.graph.nodes;
  if (nodes.length === 0) {
    return `<p class="muted">No memory files to graph.</p>`;
  }

  const orphanSet = new Set(av.graph.orphans);
  const baseNodes = nodes.filter((n) => !orphanSet.has(n.slug));
  const gutterNodes = nodes.filter((n) => orphanSet.has(n.slug));
  const maxBytes = nodes.reduce((m, n) => Math.max(m, n.bytes), 0);

  const W = 1000;
  const gutterW = gutterNodes.length ? 150 : 0;
  const plotW = W - 60 - gutterW;
  const baseY = 220;
  const H = 280;

  const xOf = (i: number, n: number): number =>
    n <= 1 ? 30 + plotW / 2 : px(30 + (i / (n - 1)) * plotW);
  const pos = new Map<string, number>();
  baseNodes.forEach((n, i) => pos.set(n.slug, xOf(i, baseNodes.length)));

  // Arcs above the baseline for resolved body links; red stubs for broken ones.
  const bodyEdges = av.graph.edges.filter((e: LinkEdge) => e.kind !== "index");
  const arcs: string[] = [];
  for (const e of bodyEdges) {
    const x1 = pos.get(e.from);
    if (x1 == null) continue;
    if (e.resolved && e.resolvedTo && pos.has(e.resolvedTo)) {
      if (e.resolvedTo === e.from) continue; // self-link: skip the arc
      const x2 = pos.get(e.resolvedTo)!;
      const mx = (x1 + x2) / 2;
      const lift = Math.min(150, 30 + Math.abs(x2 - x1) * 0.42);
      arcs.push(`<path d="M ${x1} ${baseY} Q ${px(mx)} ${px(baseY - lift)} ${x2} ${baseY}" class="arc-edge"><title>${esc(e.from)} → ${esc(e.resolvedTo)}</title></path>`);
    } else {
      arcs.push(`<line x1="${x1}" y1="${baseY}" x2="${x1}" y2="${baseY - 34}" class="arc-broken"/>
        <circle cx="${x1}" cy="${baseY - 38}" r="3.5" class="arc-brokenDot"><title>broken link → ${esc(e.to)}</title></circle>`);
    }
  }

  const drawNode = (n: GraphNode, x: number, y: number): string => {
    const r = nodeRadius(n.bytes, maxBytes);
    const label = n.slug.length > 16 ? n.slug.slice(0, 15) + "…" : n.slug;
    return `<g class="arc-node"><circle cx="${x}" cy="${y}" r="${r}" fill="${typeColor(n.type)}" ${n.inIndex ? "" : 'stroke="var(--red)" stroke-dasharray="2 2"'}><title>${esc(n.slug)} · ${esc(n.type)} · ${fmtBytes(n.bytes)} · in/out ${n.inDeg}/${n.outDeg}${n.inIndex ? "" : " · not in index"}</title></circle>
      <text x="${x}" y="${px(y + r + 12)}" text-anchor="middle" class="arc-lab">${esc(label)}</text></g>`;
  };

  const baseMarkup = baseNodes.map((n) => drawNode(n, pos.get(n.slug)!, baseY)).join("");
  const baseLine = baseNodes.length
    ? `<line x1="20" y1="${baseY}" x2="${px(30 + plotW)}" y2="${baseY}" class="arc-base"/>`
    : "";

  const gutterMarkup = gutterNodes.length
    ? `<line x1="${W - gutterW + 6}" y1="40" x2="${W - gutterW + 6}" y2="${H - 20}" class="arc-gutterLine"/>
       <text x="${W - gutterW + 16}" y="34" class="arc-gutterLab">orphans (${gutterNodes.length})</text>`
      + gutterNodes.map((n, i) => drawNode(n, W - gutterW + 46, 64 + i * 46)).join("")
    : "";

  return `<svg viewBox="0 0 ${W} ${H}" class="mg-arc" role="img" aria-label="Memory link graph">
    ${baseLine}
    ${arcs.join("")}
    ${baseMarkup}
    ${gutterMarkup}
  </svg>`;
};
