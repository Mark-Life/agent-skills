/** Assemble the self-contained HTML memory-view report from an AnalyzedVault. */
import type { AnalyzedVault, Finding } from "./types.ts";
import { renderBudgetGauge, renderTypeDonut, renderArcGraph, typeColor } from "./svg.ts";
import { CSS, JS } from "./assets.ts";
import { esc, fmtBytes, firstLine } from "./tokens.ts";
import {
  SEV_RANK, SEV_LABEL, groupOf, maxSev, indexFindings,
  renderFindingCard, memRow, MEM_TABLE_COLGROUP,
} from "./render-shared.ts";

/** Dismissible secrets banner — same posture as session-report, copy keyed off redaction. */
const renderBanner = (av: AnalyzedVault): string => {
  const msg = av.redacted
    ? "This report embeds your memory bodies. Best-effort secret redaction ran, but is not guaranteed — review before sharing."
    : "Redaction is OFF (--no-redact). This report embeds raw memory bodies and may contain secrets, tokens, and absolute paths — do not share.";
  const bg = av.redacted ? "#7a2" : "var(--red)";
  return `<div id="secrets-warn" style="background:${bg};color:#fff;padding:8px 14px;font-size:13px;display:flex;gap:10px;align-items:center;justify-content:space-between"><span>⚠ ${esc(msg)}</span><button onclick="this.parentNode.remove()" style="background:rgba(0,0,0,.25);color:#fff;border:0;border-radius:999px;padding:3px 12px;cursor:pointer">Dismiss</button></div>`;
};

/** Sticky header: project, memory dir path, totals, severity counts, jump chips. */
const renderHeader = (av: AnalyzedVault): string => {
  const broken = av.graph.edges.filter((e) => !e.resolved).length;
  const sevCells = SEV_LABEL.map((s) => {
    const n = av.severityCounts[s] ?? 0;
    return n > 0 ? `<span class="sc sev-${s}"><span class="sev-dot bg-${s}"></span>${n} ${s}</span>` : "";
  }).filter(Boolean).join("");

  const hasGroup = (g: string): boolean => av.findings.some((f) => groupOf(f.check) === g);
  const chips: string[] = [];
  if (hasGroup("SEC")) chips.push(`<span class="chip bad" data-jump="grp-SEC">secrets</span>`);
  if (broken > 0 || hasGroup("LNK")) chips.push(`<span class="chip bad" data-jump="grp-LNK">broken-links</span>`);
  if (hasGroup("DUP") || av.candidates.some((c) => c.kind === "near-dup")) chips.push(`<span class="chip warn" data-jump="grp-DUP">duplicates</span>`);
  if (hasGroup("STA")) chips.push(`<span class="chip warn" data-jump="grp-STA">stale</span>`);
  if (av.graph.orphans.length) chips.push(`<span class="chip" data-jump="orphans">orphans</span>`);

  return `<header class="sticky"><div class="hdr">
    <div class="hdr-top">
      <div class="hdr-id">
        <div class="title">${esc(av.project)} · memory</div>
        <div class="sub"><span class="path" data-copy="${esc(av.memoryDir)}" data-label="${esc(av.memoryDir)}" title="click to copy">${esc(av.memoryDir)}</span></div>
      </div>
      <div class="controls"><button id="theme-toggle">☀ light</button></div>
    </div>
    <div class="totals">
      <span><b>${av.files.length}</b> memories</span>
      <span><b>${fmtBytes(av.totalBytes)}</b></span>
      <span><b>${broken}</b> broken links</span>
      <span><b>${av.graph.orphans.length}</b> orphans</span>
      <span class="sev-counts">${sevCells || '<span class="sc sev-low">no findings</span>'}</span>
    </div>
    <div class="chips">${chips.join("")}</div>
  </div></header>`;
};

/** "Nothing to curate here" panel + a pivot table of other projects with memory. */
const renderDeadEnd = (av: AnalyzedVault): string => {
  const narrative: Record<string, [string, string]> = {
    absent: ["No memory dir for this project", `Nothing exists at <code>${esc(av.memoryDir)}</code>. Claude has not written any auto-memory for this project yet — this is the common, healthy case, not an error.`],
    empty: ["Empty memory dir", `The dir <code>${esc(av.memoryDir)}</code> exists but holds no topic files and no usable index. Nothing to audit; you may safely delete the dir.`],
    monolithic: ["MEMORY.md is prose, not an index", `<code>${esc(av.memoryDir)}/MEMORY.md</code> is a single monolithic note (headings/prose) with no bullet index and no topic files. It can't be re-indexed safely — migrate facts into topic files, or keep it as one prose memory.`],
  };
  const [title, body] = narrative[av.state] ?? ["Nothing to curate", ""];
  const rows = av.otherProjects.map((p) =>
    `<tr><td>${esc(p.project)}</td><td class="num" data-v="${p.fileCount}">${p.fileCount}</td><td>${p.hasIndex ? "yes" : "—"}</td><td><code data-copy="${esc(p.memoryDir)}" data-label="${esc(p.slug)}" title="click to copy path">${esc(p.slug)}</code></td></tr>`,
  ).join("");
  return `<section id="deadend"><h2>${esc(title)}</h2>
    <div class="deadend"><h3>${esc(av.state)} vault</h3><p>${body}</p></div>
    ${av.otherProjects.length ? `<h3 style="font-size:14px;margin:18px 0 8px;color:var(--mut)">Other projects with memory — pivot to one of these</h3>
    <table data-sortable><thead><tr><th data-sort="str">Project</th><th data-sort="num">Files</th><th>Index?</th><th data-sort="str">Slug</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted">No other projects on this machine have memory.</p>`}</section>`;
};

/** Budget-gauge section — the headline visual. */
const renderGaugeSection = (av: AnalyzedVault): string =>
  `<section id="gauge"><h2>MEMORY.md budget</h2>
    <div class="lead">Claude only auto-loads the first 200 lines / 25 KB of <code>MEMORY.md</code>. Everything past the cliff is invisible. Today's indexes are usually tiny; this earns its place defensively as vaults grow.</div>
    ${renderBudgetGauge(av)}</section>`;

/** Type donut + quick stats. */
const renderDonutSection = (av: AnalyzedVault): string => {
  const legend = Object.entries(av.typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `<span class="le"><span class="swatch" style="background:${typeColor(t)}"></span>${esc(t)} · <b>${n}</b></span>`)
    .join("");
  return `<section id="types"><h2>Memories by type</h2>
    <div class="lead">Content files grouped by frontmatter <code>type</code>. A healthy vault skews toward <code>project</code>/<code>reference</code> facts.</div>
    <div class="donut-wrap">${renderTypeDonut(av)}<div class="donut-legend">${legend || '<span class="muted">no typed files</span>'}</div></div></section>`;
};

/** Browse table — one row per memory, searchable + facet-filterable, with each
 * row expanding inline to its full detail (frontmatter, body, links, findings). */
const renderBrowse = (av: AnalyzedVault, byFile: Map<string, Finding[]>): string => {
  const nodeBySlug = new Map(av.graph.nodes.map((n) => [n.slug, n] as const));
  const fileSet = new Set(av.files.map((f) => f.slug));
  const types = Object.keys(av.typeCounts).sort();
  const facets = types.map((t) => `<span class="facet" data-type="${esc(t)}" data-active="false"><span class="swatch" style="background:${typeColor(t)}"></span> ${esc(t)}</span>`).join("");

  const rows = av.files.map((f) => memRow(av, f, byFile, nodeBySlug, fileSet)).join("");

  return `<section id="browse"><h2>Browse memories</h2>
    <div class="lead">Every topic file. Search title/description/body, filter by type, or show only files with findings. Click any row to expand its frontmatter, body, and links.</div>
    <div class="filterbar">
      <input type="search" id="browse-search" placeholder="search title, description, body…">
      <div class="facets">${facets}<span class="facet issues" data-active="false">has issues</span></div>
      <button data-expand-all="#browse-table" data-open="0">Expand all</button>
    </div>
    <table id="browse-table" data-sortable>${MEM_TABLE_COLGROUP}<thead><tr>
      <th data-sort="str">Title</th><th data-sort="str">Type</th><th>Description</th>
      <th data-sort="num">Size</th><th data-sort="str">Modified</th><th>In&nbsp;index</th>
      <th data-sort="num">In/Out</th><th data-sort="num">Issues</th>
    </tr></thead><tbody>${rows}</tbody></table></section>`;
};

/** Index-vs-files diff: MEMORY.md entries beside actual files, drift highlighted. */
const renderDiff = (av: AnalyzedVault): string => {
  const fileSlugsLower = new Set(av.files.map((f) => f.slug.toLowerCase()));
  const fileByLower = new Map(av.files.map((f) => [f.slug.toLowerCase(), f] as const));
  const indexedLower = new Set(av.graph.nodes.filter((n) => n.inIndex).map((n) => n.slug.toLowerCase()));

  const entryItems = (av.index?.entries ?? []).map((e) => {
    if (e.malformed) return `<li class="warn"><span>${esc(e.raw.trim() || "(blank)")}</span><span class="dnote">malformed</span></li>`;
    const resolved = e.targetSlug ? fileSlugsLower.has(e.targetSlug) : false;
    const file = e.targetSlug ? fileByLower.get(e.targetSlug) : undefined;
    const drift = file && e.hook && file.frontmatter.description &&
      e.hook.trim().toLowerCase() !== file.frontmatter.description.trim().toLowerCase();
    const cls = !resolved ? "bad" : drift ? "warn" : "ok";
    const note = !resolved ? "dangling — no file" : drift ? "hook ≠ description" : "ok";
    return `<li class="${cls}"><span>${esc(e.label || e.target || e.raw.trim())}</span><span class="dnote">${note}</span></li>`;
  }).join("");

  const fileItems = av.files.map((f) => {
    const inIdx = indexedLower.has(f.slug.toLowerCase());
    const cls = inIdx ? "ok" : "warn";
    return `<li class="${cls}"><span>${esc(f.slug)}</span><span class="dnote">${inIdx ? "indexed" : "orphan — not in index"}</span></li>`;
  }).join("");

  return `<section id="diff"><h2>Index vs. files</h2>
    <div class="lead">Drift between <code>MEMORY.md</code> and what's actually on disk. Dangling entries point at missing files; orphan files are never indexed (so Claude won't surface them).</div>
    <div class="diffcols">
      <div><h3>MEMORY.md entries (${av.index?.entries.length ?? 0})</h3><ul class="difflist">${entryItems || '<li class="warn"><span>no index entries</span></li>'}</ul></div>
      <div id="orphans"><h3>Files on disk (${av.files.length})</h3><ul class="difflist">${fileItems || '<li><span>no files</span></li>'}</ul></div>
    </div></section>`;
};

/** Findings section: a compact triage table on top, then cards grouped by category. */
const renderFindings = (av: AnalyzedVault, byFile: Map<string, Finding[]>): string => {
  if (!av.findings.length) {
    return `<section id="findings"><h2>Findings</h2><div class="lead">No deterministic findings — this vault is clean. Model-judgment candidates (if any) live in <code>findings.json</code>.</div></section>`;
  }
  const fileSet = new Set(av.files.map((f) => f.slug));
  const nodeBySlug = new Map(av.graph.nodes.map((n) => [n.slug, n] as const));
  const fileBySlug = new Map(av.files.map((f) => [f.slug, f] as const));

  // Triage table — one row per affected file, worst issue first.
  const triageRows = [...byFile.entries()]
    .map(([key, fs]) => ({ key, fs, sev: maxSev(fs)! }))
    .sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev] || b.fs.length - a.fs.length)
    .map(({ key, fs }) => {
      const top = [...fs].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity])[0];
      const file = fileBySlug.get(key);
      const node = nodeBySlug.get(key);
      const type = file ? file.frontmatter.type ?? "unknown" : key === "MEMORY.md" ? "index" : "vault";
      const lines = file ? String(file.lines) : key === "MEMORY.md" ? String(av.index?.lines ?? 0) : "—";
      const inout = node ? `${node.inDeg}/${node.outDeg}` : "—";
      const ref = file ? `<a data-jump="file-${esc(key)}">${esc(key)}</a>` : `<span class="mono">${esc(key === "__vault__" ? "(vault)" : key)}</span>`;
      return `<tr><td>${ref}</td><td>${esc(type)}</td><td class="num">${lines}</td><td>${node?.inIndex ? "yes" : "—"}</td><td class="num">${inout}</td>
        <td><span class="sev-pill sev-${top.severity}">${esc(top.severity)}</span> <span class="mono">${esc(top.check)}</span> ${esc(firstLine(top.message, 70))}</td></tr>`;
    }).join("");

  // Grouped finding cards.
  const groups = new Map<string, Finding[]>();
  for (const f of av.findings) groups.set(groupOf(f.check), [...(groups.get(groupOf(f.check)) ?? []), f]);
  const groupBlocks = [...groups.entries()]
    .sort((a, b) => SEV_RANK[maxSev(b[1])!] - SEV_RANK[maxSev(a[1])!])
    .map(([g, fs]) => {
      const cards = [...fs].sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]).map((f) => renderFindingCard(av, f, fileSet)).join("");
      return `<details class="fgroup" id="grp-${esc(g)}" open><summary>${esc(g)} · ${fs.length} finding${fs.length === 1 ? "" : "s"} <span class="sev-pill sev-${maxSev(fs)}">${esc(maxSev(fs)!)}</span></summary>${cards}</details>`;
    }).join("");

  return `<section id="findings"><h2>Findings (${av.findings.length})</h2>
    <div class="lead">Deterministic audit results. The triage table drives the curate loop — refresh it by re-running the scan after each batch of fixes. Cards below are grouped by category.</div>
    <table data-sortable style="margin-bottom:18px"><thead><tr>
      <th data-sort="str">File</th><th data-sort="str">Type</th><th data-sort="num">Lines</th><th>In&nbsp;idx</th><th data-sort="num">In/Out</th><th>Top issue</th>
    </tr></thead><tbody>${triageRows}</tbody></table>
    ${groupBlocks}</section>`;
};

/** Optional/secondary link-graph section. */
const renderGraphSection = (av: AnalyzedVault): string =>
  `<section id="graph"><h2>Link graph</h2>
    <div class="lead">Nodes are memories (colored by type, sized by bytes); arcs are resolved body links. Red stubs are broken links; dashed-outline nodes aren't in the index; orphans sit in the right gutter.</div>
    ${renderArcGraph(av)}</section>`;

/** Methodology + privacy boundary prose. */
const renderMethodology = (av: AnalyzedVault): string =>
  `<section id="methodology"><h2>Methodology &amp; privacy</h2>
    <div class="lead">What the script decided vs. what a model must judge — and where your content travels.</div>
    <div class="prose">
      <p><strong>Deterministic vs. model.</strong> The findings above are <em>deterministic</em>: a script resolved them with certainty (broken links, dangling/orphan index entries, budget overflow, schema gaps, absolute-path leaks, exact dups). Softer calls — semantic duplicates, contradictions, staleness, redundancy, retyping, missing Why/How — are emitted as <em>candidates</em> in <code>findings.json</code> for a model to confirm, never asserted here as facts.</p>
      <p><strong>Privacy boundary.</strong> This HTML embeds your memory bodies, so ${av.redacted ? "best-effort redaction (provider key patterns, entropy gating, placeholder guards) protects the <em>shareable artifact</em> and the persisted findings.json" : "<strong>redaction is OFF</strong> — raw bodies are embedded verbatim"}. But the curate phase lets a model read the <strong>raw</strong> bodies of <em>flagged items only</em> (never the whole vault) to resolve contradictions/dups/staleness. So redaction shields the artifact, <strong>not</strong> the model's working set — a narrower win than session-report, where the model never reads content. The deterministic script stays the only reader of the whole vault.</p>
      <p><strong>Long-line caveat.</strong> Real memory bodies pack single paragraphs up to ~1,600 chars per line. Use this script (not <code>grep</code>/<code>wc</code>/<code>sed</code>) to read and edit them — line-oriented tools mis-count and truncate. Longest line seen here is reported per file in the detail panels.</p>
      <p class="muted">Vault: <code>${esc(av.memoryDir)}</code> · schema v${av.schemaVersion}${av.generatedAt ? ` · generated ${esc(av.generatedAt.slice(0, 16).replace("T", " "))}` : ""}</p>
    </div></section>`;

/** Build the complete self-contained HTML document. */
export const renderReport = (av: AnalyzedVault): string => {
  const byFile = indexFindings(av);
  const deadEnd = av.state !== "ok";
  const data = { redacted: av.redacted, project: av.project };
  const dataJson = JSON.stringify(data).replace(/</g, "\\u003c");

  const body = deadEnd
    ? `${renderDeadEnd(av)}
${renderGaugeSection(av)}
${renderFindings(av, byFile)}
${renderMethodology(av)}`
    : `${renderGaugeSection(av)}
${renderDonutSection(av)}
${renderBrowse(av, byFile)}
${renderDiff(av)}
${renderFindings(av, byFile)}
${renderGraphSection(av)}
${renderMethodology(av)}`;

  return `<!doctype html><html lang="en" data-theme="dark"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(av.project)} · memory view</title>
<style>${CSS}</style></head><body>
${renderBanner(av)}
${renderHeader(av)}
<div class="wrap">
${body}
<footer>Generated by <a href="https://github.com/Mark-Life/agent-skills/tree/main/skills/inspect-and-debug/memory-view" target="_blank" rel="noopener">memory-view</a> · ${esc(av.slug)} · created by <a href="https://andrey-markin.com" target="_blank" rel="noopener">andrey-markin.com</a></footer>
</div>
<script>window.__CTX__=${dataJson};</script>
<script>${JS}</script>
</body></html>`;
};
