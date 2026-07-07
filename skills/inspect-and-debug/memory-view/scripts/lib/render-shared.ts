/** Per-memory + finding building blocks shared by the single-project report
 * (render.ts) and the cross-project explorer (render-all.ts).
 *
 * Every element id is composed as `${idPrefix}file-<slug>` / `${idPrefix}grp-<GRP>`.
 * The single-project report passes `idPrefix=""` (the default) so its output stays
 * byte-identical; the cross-project report passes a per-project prefix so the same
 * markup can appear once per project on one page without id collisions.
 */
import type { AnalyzedVault, Finding, GraphNode, MemoryFile, Severity, LinkEdge } from "./types.ts";
import { typeColor } from "./svg.ts";
import { esc, fmt, fmtBytes, firstLine, cap } from "./tokens.ts";

export const SEV_RANK: Record<Severity, number> = { low: 0, med: 1, high: 2, critical: 3 };
export const SEV_LABEL: Severity[] = ["critical", "high", "med", "low"];

/** Fixed column widths for the expandable memory tables. Paired with
 * `table-layout:fixed`, this locks the 8 columns (title/type/description/size/
 * modified/in-idx/in-out/issues) so expanding a row's inline detail (a colspan
 * cell) never reflows the column widths. */
export const MEM_TABLE_COLGROUP =
  `<colgroup><col style="width:24%"><col style="width:10%"><col style="width:30%"><col style="width:8%"><col style="width:10%"><col style="width:6%"><col style="width:6%"><col style="width:6%"></colgroup>`;

/** Catalog group for a check id (strip the trailing number), e.g. "LNK01" -> "LNK". */
export const groupOf = (check: string): string => check.replace(/[0-9]+$/, "");

/** Highest-severity finding wins; returns its severity or null for an empty list. */
export const maxSev = (fs: Finding[]): Severity | null =>
  fs.reduce<Severity | null>((m, f) => (m == null || SEV_RANK[f.severity] > SEV_RANK[m] ? f.severity : m), null);

/** Group findings by their affected file slug (vault-level findings keyed "__vault__"). */
export const indexFindings = (av: AnalyzedVault): Map<string, Finding[]> => {
  const m = new Map<string, Finding[]>();
  for (const f of av.findings) {
    const k = f.file ?? "__vault__";
    m.set(k, [...(m.get(k) ?? []), f]);
  }
  return m;
};

/** A small type-color swatch chip for the type label. */
export const typeChip = (t: string): string =>
  `<span class="tchip" style="background:${typeColor(t)}">${esc(t)}</span>`;

/** Issues badge: count colored by the file's worst severity (muted "0" when clean). */
export const issuesBadge = (fs: Finding[]): string => {
  if (!fs.length) return `<span class="ibadge none">0</span>`;
  const s = maxSev(fs)!;
  return `<span class="ibadge sev-${s}">${fs.length}</span>`;
};

/** A single finding card (reused in the grouped list and per-file details). */
export const renderFindingCard = (av: AnalyzedVault, f: Finding, fileSet: Set<string>, idPrefix = ""): string => {
  const fileRef = f.file
    ? fileSet.has(f.file)
      ? `<a data-jump="${idPrefix}file-${esc(f.file)}">${esc(f.file)}</a>`
      : `<span class="mono">${esc(f.file)}</span>`
    : `<span class="muted">vault-level</span>`;
  const ev = f.evidence ? `<pre class="ev">${esc(cap(f.evidence, 1200))}</pre>` : "";
  const fix = f.suggestedFix ? `<div class="fx"><b>Fix:</b> ${esc(f.suggestedFix)}</div>` : "";
  const cands = f.candidates?.length ? `<div class="fx"><b>Candidates:</b> ${f.candidates.map((c) => `<code>${esc(c)}</code>`).join(" ")}</div>` : "";
  return `<div class="finding sev-${f.severity}">
    <div class="fhead"><span class="sev-pill sev-${f.severity}">${esc(f.severity)}</span>
      <span class="fid">${esc(f.check)}</span><span class="fname">${esc(f.name)}</span></div>
    <div class="fmsg">${esc(f.message)}</div>
    <div class="fmeta">${fileRef}${f.line ? ` · line ${f.line}` : ""} · method ${esc(f.method)} · tier ${esc(f.tier)}</div>
    ${ev}${fix}${cands}</div>`;
};

/** Inner detail content for one memory: frontmatter table, file meta, raw/copy
 * toggle, body (+raw), in/out links, and per-file finding cards. Rendered once,
 * inline under the memory's summary row (revealed on expand). */
const memBody = (
  av: AnalyzedVault,
  f: MemoryFile,
  byFile: Map<string, Finding[]>,
  nodeBySlug: Map<string, GraphNode>,
  fileSet: Set<string>,
  idPrefix = "",
): string => {
  const fm = f.frontmatter;
  const fmRows: [string, string | undefined][] = [
    ["name", fm.name], ["description", fm.description], ["type", fm.type],
    ["node_type", fm.nodeType], ["originSessionId", fm.originSessionId],
    ["created", fm.created], ["updated", fm.updated], ["schema shape", fm.shape],
    ...Object.entries(fm.extra),
  ];
  const fmTable = fmRows.filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v as string)}</td></tr>`).join("");

  const out = av.graph.edges.filter((e) => e.from === f.slug);
  const inb = av.graph.edges.filter((e) => e.resolvedTo === f.slug && e.from !== f.slug && e.kind !== "index");
  const outItems = out.map((e: LinkEdge) =>
    e.resolved && e.resolvedTo
      ? `<li><a data-jump="${idPrefix}file-${esc(e.resolvedTo)}">${esc(e.resolvedTo)}</a></li>`
      : `<li class="linkbroken">${esc(e.to)} ✗ broken</li>`).join("");
  const inItems = inb.map((e) => `<li><a data-jump="${idPrefix}file-${esc(e.from)}">${esc(e.from)}</a></li>`).join("");

  const node = nodeBySlug.get(f.slug);
  const fs = byFile.get(f.slug) ?? [];
  const findingCards = fs.length ? `<div style="margin-top:12px"><b style="font-size:12px;color:var(--mut)">Findings for this file</b>${fs.map((x) => renderFindingCard(av, x, fileSet, idPrefix)).join("")}</div>` : "";
  const rawDoc = (fm.raw ? `---\n${fm.raw}\n---\n` : "") + f.body;

  return `<div class="mem-body">
        <table class="fmtable"><tbody>${fmTable || '<tr><td class="k">frontmatter</td><td class="muted">none</td></tr>'}</tbody></table>
        <div class="fmeta" style="margin-top:8px;font-family:var(--mono);font-size:12px;color:var(--mut)">
          ${fmtBytes(f.bytes)} · ${f.lines} lines · longest line ${fmt(f.maxLineLength)} chars · modified ${esc(f.mtime.slice(0, 16).replace("T", " "))}
          · Why ${f.hasWhy ? "✓" : "—"} · How-to-apply ${f.hasHowToApply ? "✓" : "—"}
          · in/out ${node?.inDeg ?? 0}/${node?.outDeg ?? 0} · ${node?.inIndex ? "in index" : "not in index"}</div>
        <div style="margin-top:10px"><button class="rawbtn">raw markdown</button><button class="copybtn">copy</button></div>
        <pre class="body-rendered">${esc(cap(f.body, 60000)) || "(empty body)"}</pre>
        <pre class="body-raw hidden">${esc(cap(rawDoc, 60000))}</pre>
        <div class="mem-links">
          <div><b>Out links</b><ul>${outItems || '<li class="muted">none</li>'}</ul></div>
          <div><b>In links</b><ul>${inItems || '<li class="muted">none</li>'}</ul></div>
        </div>
        ${findingCards}
      </div>`;
};

/** Options for an expandable memory row (id namespacing + filter attrs + colspan). */
export interface MemRowOpts {
  idPrefix?: string;
  /** Extra attributes appended to the summary `<tr>` (e.g. `data-mem` for the cross-project filter). */
  extraAttrs?: string;
  /** Column count for the detail row's spanning cell (must match the table's `<thead>`). */
  colspan?: number;
}

/** One memory as a pair of table rows: a clickable summary `<tr class="mrow">`
 * carrying the jump id + filter data-attrs, immediately followed by a hidden
 * `<tr class="mdetail">` whose single cell holds the full detail (memBody),
 * revealed inline on expand. Collapses the old "table + separate panel" duplication
 * into a single self-expanding row. */
export const memRow = (
  av: AnalyzedVault,
  f: MemoryFile,
  byFile: Map<string, Finding[]>,
  nodeBySlug: Map<string, GraphNode>,
  fileSet: Set<string>,
  opts: MemRowOpts = {},
): string => {
  const idPrefix = opts.idPrefix ?? "";
  const colspan = opts.colspan ?? 8;
  const extra = opts.extraAttrs ? ` ${opts.extraAttrs}` : "";
  const node = nodeBySlug.get(f.slug);
  const fs = byFile.get(f.slug) ?? [];
  const desc = f.frontmatter.description || firstLine(f.body, 120) || "—";
  const type = f.frontmatter.type ?? "unknown";
  const title = f.frontmatter.name || f.slug;
  const search = `${title} ${desc} ${f.body.slice(0, 500)}`.replace(/\s+/g, " ");
  const detailId = `${idPrefix}detail-${esc(f.slug)}`;

  const summary = `<tr class="mrow" id="${idPrefix}file-${esc(f.slug)}" tabindex="0" role="button" aria-expanded="false" aria-controls="${detailId}" data-search="${esc(search)}" data-type="${esc(type)}" data-issues="${fs.length}"${extra}>
      <td class="mtitle-cell"><span class="caret" aria-hidden="true">▸</span><span class="mtitle">${esc(title)}</span></td>
      <td>${typeChip(type)}</td>
      <td class="mdesc">${esc(cap(desc, 160))}</td>
      <td class="num msize" data-v="${f.bytes}">${fmtBytes(f.bytes)}<br><small class="muted">${f.lines} ln</small></td>
      <td class="num" data-v="${esc(f.mtime)}">${esc(f.mtime.slice(0, 10))}</td>
      <td>${node?.inIndex ? "yes" : '<span class="muted">no</span>'}</td>
      <td class="num" data-v="${(node?.inDeg ?? 0) + (node?.outDeg ?? 0)}">${node?.inDeg ?? 0}/${node?.outDeg ?? 0}</td>
      <td>${issuesBadge(fs)}</td>
    </tr>`;
  const detail = `<tr class="mdetail hidden" id="${detailId}"><td colspan="${colspan}">${memBody(av, f, byFile, nodeBySlug, fileSet, idPrefix)}</td></tr>`;
  return summary + detail;
};
