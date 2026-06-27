/** Build and resolve the memory link graph: body links + index edges against the
 * set of real files, flagging broken / ambiguous / self links and graph orphans,
 * and supplying near-match repair candidates for fix-link.
 */
import type { Vault, GraphData, GraphNode, LinkEdge } from "./types.ts";
import { normalizeSlug } from "./parse.ts";

export const INDEX_NODE = "__index__";

/** Levenshtein distance, capped — cheap on the tiny target sets here. */
const editDistance = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
};

/** Unique near-matches for an unresolved target slug (for fix-link repair). */
const nearMatches = (target: string, slugs: string[]): string[] =>
  slugs
    .filter((s) => s !== target)
    .filter((s) => s.includes(target) || target.includes(s) || editDistance(target, s) <= 2)
    .sort((a, b) => editDistance(target, a) - editDistance(target, b));

/**
 * Resolve all edges in the vault. Body links contribute to node degrees and
 * orphan detection; index edges are tracked for dangling-entry checks but do
 * not count toward graph orphan status (LNK07 = no in/out *body* links).
 */
export const buildGraph = (vault: Vault): GraphData => {
  const fileSlugs = vault.files.map((f) => f.slug);
  // lowercased slug -> actual file slugs sharing it (detects case/sep collisions).
  const byNorm = new Map<string, string[]>();
  for (const f of vault.files) {
    const k = f.slug.toLowerCase();
    byNorm.set(k, [...(byNorm.get(k) ?? []), f.slug]);
  }
  const resolveSlug = (target: string): { resolvedTo?: string; ambiguous: boolean } => {
    const hits = byNorm.get(target) ?? [];
    if (hits.length === 1) return { resolvedTo: hits[0], ambiguous: false };
    if (hits.length > 1) return { resolvedTo: hits[0], ambiguous: true };
    return { ambiguous: false };
  };

  const edges: LinkEdge[] = [];
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();

  for (const f of vault.files) {
    for (const link of f.links) {
      const { resolvedTo, ambiguous } = resolveSlug(link.targetSlug);
      const resolved = !!resolvedTo;
      const edge: LinkEdge = {
        from: f.slug,
        to: link.targetSlug,
        kind: link.kind,
        resolved,
        resolvedTo,
        ambiguous: ambiguous || undefined,
        line: link.line,
      };
      if (!resolved) edge.candidates = nearMatches(link.targetSlug, fileSlugs);
      edges.push(edge);
      if (resolved && resolvedTo) {
        outDeg.set(f.slug, (outDeg.get(f.slug) ?? 0) + 1);
        // self-links don't add inbound credit toward orphan rescue
        if (resolvedTo !== f.slug) inDeg.set(resolvedTo, (inDeg.get(resolvedTo) ?? 0) + 1);
      }
    }
  }

  // Index edges (for dangling-entry / orphan-file checks downstream).
  const indexed = new Set<string>();
  if (vault.index) {
    for (const e of vault.index.entries) {
      if (!e.targetSlug) continue;
      const { resolvedTo } = resolveSlug(e.targetSlug);
      if (resolvedTo) indexed.add(resolvedTo);
      const edge: LinkEdge = {
        from: INDEX_NODE,
        to: e.targetSlug,
        kind: "index",
        resolved: !!resolvedTo,
        resolvedTo,
        line: e.lineNumber,
      };
      if (!resolvedTo) edge.candidates = nearMatches(e.targetSlug, fileSlugs);
      edges.push(edge);
    }
  }

  const nodes: GraphNode[] = vault.files.map((f) => ({
    slug: f.slug,
    type: f.frontmatter.type ?? "unknown",
    bytes: f.bytes,
    inIndex: indexed.has(f.slug),
    inDeg: inDeg.get(f.slug) ?? 0,
    outDeg: outDeg.get(f.slug) ?? 0,
  }));

  const orphans = nodes.filter((n) => n.inDeg === 0 && n.outDeg === 0).map((n) => n.slug);

  return { nodes, edges, orphans };
};
