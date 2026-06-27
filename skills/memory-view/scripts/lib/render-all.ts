/** Cross-project explorer HTML for `--all`: every project on the machine that has
 * memory, rendered as a per-project accordion so you can browse *all* memories
 * grouped by project on one page. A sortable overview sits on top for discovery.
 *
 * Curation is always single-project, so this surface is read-only — it reuses the
 * single-project building blocks (browse rows, memory panels, finding cards) from
 * render-shared.ts with a per-project id prefix to keep element ids unique.
 */
import type { AnalyzedVault } from "./types.ts";
import { CSS, JS } from "./assets.ts";
import { esc, fmt, fmtBytes } from "./tokens.ts";
import { typeColor } from "./svg.ts";
import {
  SEV_LABEL, maxSev, indexFindings, renderFindingCard, memRow, MEM_TABLE_COLGROUP,
} from "./render-shared.ts";

/** Per-project element-id prefix, kept selector-safe (leading letter) and unique. */
const prefixOf = (i: number): string => `g${i}-`;

/** Display name for a project: drop the leading prefix-strip dash (slug stays intact). */
const niceName = (p: string): string => p.replace(/^-+/, "") || p;

/** Severity-count cell cluster for a vault (header + overview reuse). */
const sevCells = (av: AnalyzedVault): string =>
  SEV_LABEL.map((s) => {
    const n = av.severityCounts[s] ?? 0;
    return n > 0 ? `<span class="sc sev-${s}"><span class="sev-dot bg-${s}"></span>${n}</span>` : "";
  })
    .filter(Boolean)
    .join("") || '<span class="muted">—</span>';

/** Budget cell: lines vs the 200-line cliff, flagged when over or near. */
const budgetCell = (av: AnalyzedVault): string => {
  const { lines, maxLines, overBudget, kind } = av.indexBudget;
  if (kind === "absent") return `<span class="muted">no index</span>`;
  if (kind === "monolithic") return `<span class="ibadge sev-med">monolithic</span>`;
  const cls = overBudget ? "sev-high" : lines > maxLines * 0.8 ? "sev-med" : "none";
  return `<span class="ibadge ${cls}">${lines}/${maxLines} ln</span>`;
};

/** Short narrative for a project with no browsable memories (empty/monolithic). */
const emptyNarrative = (av: AnalyzedVault): string => {
  if (av.state === "monolithic")
    return `<code>MEMORY.md</code> is a single prose note with no bullet index and no topic files — nothing to browse here. Open it directly to read or migrate it.`;
  if (av.state === "empty")
    return `The dir exists but holds no topic files and no usable index. Safe to delete.`;
  return `No topic files on disk.`;
};

/** One collapsible project group: stats summary + browse table + memory panels. */
const renderGroup = (av: AnalyzedVault, i: number): string => {
  const pre = prefixOf(i);
  const byFile = indexFindings(av);
  const nodeBySlug = new Map(av.graph.nodes.map((n) => [n.slug, n] as const));
  const fileSet = new Set(av.files.map((f) => f.slug));
  const broken = av.graph.edges.filter((e) => !e.resolved).length;
  const sev = maxSev(av.findings);
  const sevBadge = sev ? `<span class="ibadge sev-${sev}">${av.findings.length}</span>` : `<span class="ibadge none">0</span>`;

  const stats = `<span class="proj-stats">
      <span><b>${av.files.length}</b> mem</span>
      <span>${fmtBytes(av.totalBytes)}</span>
      ${broken ? `<span class="hot">${broken} broken</span>` : ""}
      ${av.graph.orphans.length ? `<span>${av.graph.orphans.length} orphan</span>` : ""}
      <span>${sevBadge} findings</span>
    </span><span class="proj-count"></span>`;

  const summary = `<summary>
      <span class="proj-name">${esc(niceName(av.project))}</span>
      <code class="proj-slug" data-copy="${esc(av.memoryDir)}" data-label="${esc(av.slug)}" title="click to copy path">${esc(av.slug)}</code>
      ${stats}
    </summary>`;

  // Index/vault-level findings (per-file findings already live inside their panel).
  const extra = av.findings.filter((f) => !f.file || !fileSet.has(f.file));
  const extraBlock = extra.length
    ? `<details class="fgroup"><summary>Index &amp; vault-level findings · ${extra.length} <span class="sev-pill sev-${maxSev(extra)}">${maxSev(extra)}</span></summary>${extra.map((f) => renderFindingCard(av, f, fileSet, pre)).join("")}</details>`
    : "";

  if (av.state !== "ok" || av.files.length === 0) {
    const body = `<div class="proj-empty"><h4>${esc(av.state)} vault</h4><p>${emptyNarrative(av)}</p></div>${extraBlock}`;
    return `<details class="proj" id="${pre}group">${summary}<div class="proj-body">${body}</div></details>`;
  }

  const rows = av.files
    .map((f) => memRow(av, f, byFile, nodeBySlug, fileSet, { idPrefix: pre, extraAttrs: "data-mem" }))
    .join("");

  const table = `<table class="mem-table" data-sortable>${MEM_TABLE_COLGROUP}<thead><tr>
      <th data-sort="str">Title</th><th data-sort="str">Type</th><th>Description</th>
      <th data-sort="num">Size</th><th data-sort="str">Modified</th><th>In&nbsp;idx</th>
      <th data-sort="num">In/Out</th><th data-sort="num">Issues</th>
    </tr></thead><tbody>${rows}</tbody></table>`;

  return `<details class="proj" id="${pre}group" open>${summary}<div class="proj-body">
    <div class="filterbar"><span class="mut-note">Click any row to expand its frontmatter, body, and links.</span><button data-expand-all="#${pre}group" data-label="all memories" data-open="0">Expand all memories</button></div>
    ${table}
    ${extraBlock}
  </div></details>`;
};

/** The discovery overview table — one sortable row per project, linking to its group. */
const renderOverview = (sorted: AnalyzedVault[]): string => {
  const rows = sorted
    .map((av, i) => {
      const pre = prefixOf(i);
      const broken = av.graph.edges.filter((e) => !e.resolved).length;
      return `<tr>
      <td><a data-jump="${pre}group"><b>${esc(niceName(av.project))}</b></a><br><small class="muted mono">${esc(av.slug)}</small></td>
      <td><span class="ibadge ${av.state === "ok" ? "none" : "sev-med"}">${esc(av.state)}</span></td>
      <td class="num" data-v="${av.files.length}">${av.files.length}</td>
      <td class="num" data-v="${av.totalBytes}">${fmtBytes(av.totalBytes)}</td>
      <td class="num" data-v="${broken}">${broken || '<span class="muted">0</span>'}</td>
      <td class="num" data-v="${av.graph.orphans.length}">${av.graph.orphans.length || '<span class="muted">0</span>'}</td>
      <td class="num" data-v="${av.findings.length}">${av.findings.length}</td>
      <td><span class="sev-counts">${sevCells(av)}</span></td>
      <td>${budgetCell(av)}</td>
    </tr>`;
    })
    .join("");

  return `<section id="overview"><h2>Projects with memory</h2>
    <div class="lead">Sortable discovery table. Click a project to jump to its group below. Curation is always single-project — open one with <code>node scan-memory.ts &lt;slug&gt; --open</code>.</div>
    <table id="overview-table" data-sortable><thead><tr>
      <th data-sort="str">Project</th><th data-sort="str">State</th><th data-sort="num">Memories</th>
      <th data-sort="num">Size</th><th data-sort="num">Broken</th><th data-sort="num">Orphans</th>
      <th data-sort="num">Findings</th><th>Severity</th><th>Budget</th>
    </tr></thead><tbody>${rows}</tbody></table></section>`;
};

/** Build the cross-project explorer document. */
export const renderAllReport = (avs: AnalyzedVault[]): string => {
  const sorted = [...avs].sort((a, b) => b.files.length - a.files.length || a.slug.localeCompare(b.slug));
  const totalFiles = sorted.reduce((s, a) => s + a.files.length, 0);
  const totalBytes = sorted.reduce((s, a) => s + a.totalBytes, 0);
  const totalFindings = sorted.reduce((s, a) => s + a.findings.length, 0);
  const anyRedacted = sorted.some((a) => a.redacted);

  const allTypes = [...new Set(sorted.flatMap((a) => Object.keys(a.typeCounts)))].sort();
  const facets = allTypes
    .map((t) => `<span class="mfacet" data-type="${esc(t)}" data-active="false"><span class="swatch" style="background:${typeColor(t)}"></span> ${esc(t)}</span>`)
    .join("");

  const groups = sorted.map((av, i) => renderGroup(av, i)).join("");

  const banner = anyRedacted
    ? `<div id="secrets-warn" style="background:#7a2;color:#fff;padding:8px 14px;font-size:13px;display:flex;gap:10px;align-items:center;justify-content:space-between"><span>⚠ This explorer embeds memory-derived text from every project. Best-effort redaction ran — review before sharing.</span><button onclick="this.parentNode.remove()" style="background:rgba(0,0,0,.25);color:#fff;border:0;border-radius:999px;padding:3px 12px;cursor:pointer">Dismiss</button></div>`
    : `<div id="secrets-warn" style="background:var(--red);color:#fff;padding:8px 14px;font-size:13px;display:flex;gap:10px;align-items:center;justify-content:space-between"><span>⚠ Redaction is OFF — raw memory text from every project is embedded. Do not share.</span><button onclick="this.parentNode.remove()" style="background:rgba(0,0,0,.25);color:#fff;border:0;border-radius:999px;padding:3px 12px;cursor:pointer">Dismiss</button></div>`;

  return `<!doctype html><html lang="en" data-theme="dark"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>All projects · memory view</title>
<style>${CSS}</style></head><body>
${banner}
<header class="sticky"><div class="hdr">
  <div class="hdr-top">
    <div class="hdr-id">
      <div class="title">All projects · memory</div>
      <div class="sub">${sorted.length} project(s) with memory under <code>~/.claude/projects/*/memory/</code></div>
    </div>
    <div class="controls"><button id="theme-toggle">☀ light</button></div>
  </div>
  <div class="totals">
    <span><b>${sorted.length}</b> projects</span>
    <span><b>${fmt(totalFiles)}</b> memories</span>
    <span><b>${fmtBytes(totalBytes)}</b></span>
    <span><b>${fmt(totalFindings)}</b> findings</span>
  </div>
</div></header>
<div class="wrap">
${renderOverview(sorted)}
<section id="memories"><h2>All memories by project</h2>
  <div class="lead">Every memory on this machine, grouped by project. Search across all projects, filter by type, or show only flagged memories. Click a title to open its panel; projects with no match collapse away as you search.</div>
  <div class="filterbar">
    <input type="search" id="mem-search" placeholder="search across all memories…">
    <div class="facets">${facets}<span class="mfacet issues" data-active="false">has issues</span></div>
    <button data-toggle-proj data-open="1">Collapse all projects</button>
  </div>
  ${groups}
</section>
<footer>Generated by <a href="https://github.com/Mark-Life/agent-skills/tree/main/skills/memory-view" target="_blank" rel="noopener">memory-view</a> · cross-project explorer · created by <a href="https://andrey-markin.com" target="_blank" rel="noopener">andrey-markin.com</a></footer>
</div>
<script>window.__CTX__={};</script>
<script>${JS}</script>
</body></html>`;
};
