/** Model-judgment candidate generation — O(n²) word-shingle Jaccard over the vault.
 *
 * These are NOT asserted findings: each CandidateSet is evidence the model later
 * confirms (DUP02/04, CON01, SIZ01, LNK06, SCH05/06, RED01). Precision-leaning —
 * some false positives are acceptable, but the goal is to narrow, not to flood.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Vault, MemoryFile, CandidateSet } from "./types.ts";

const NEAR_DUP_MIN = 0.18;
const RELATED_MIN = 0.08;
const SUBSUME_MIN = 0.7;
const REDUNDANCY_MIN = 0.15;
const SHINGLE_K = 3;

/**
 * Opposing-marker lexicon: a pair contradicts when the two files lean to opposite
 * markers. Only genuinely mutually-exclusive states belong here — narrative pairs
 * like fixed/broken or deprecated/current are excluded because a single bug memory
 * naturally mentions both ("was broken, now fixed") and would flood false positives.
 */
const OPPOSING: ReadonlyArray<readonly [string, string]> = [
  ["main", "master"],
  ["always", "never"],
  ["enabled", "disabled"],
  ["safari", "chromium"],
];

const STOP = new Set(
  "the a an and or but to of in on for with is are was were be been being this that these those it its as at by from into not no nor so if then than too very can will just have has had do does did you your we our they their them there here when where which who what why how all any each more most other some such only own same will would should could".split(
    " ",
  ),
);

/** Lowercased word stream from a body, markdown/punctuation stripped to words. */
const toWords = (body: string): string[] =>
  body
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0);

/** Set of k=3 consecutive-word shingles for a word stream. */
const toShingles = (words: string[]): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i + SHINGLE_K <= words.length; i++) {
    set.add(words.slice(i, i + SHINGLE_K).join(" "));
  }
  return set;
};

/** Significant content terms (len>=5, non-stopword) for rare-term contradiction matching. */
const toTerms = (words: string[]): Set<string> =>
  new Set(words.filter((w) => w.length >= 5 && !STOP.has(w)));

/** |A∩B|. */
const intersectSize = (a: Set<string>, b: Set<string>): number => {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const x of small) if (large.has(x)) n++;
  return n;
};

/** Jaccard similarity |A∩B| / |A∪B| (0 when both empty). */
const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 0;
  const i = intersectSize(a, b);
  return i / (a.size + b.size - i);
};

/** Up to `max` shared members of two sets, sorted, joined for redactable evidence. */
const sharedEvidence = (a: Set<string>, b: Set<string>, max = 3): string => {
  const shared: string[] = [];
  for (const x of a) if (b.has(x)) shared.push(x);
  return shared.sort().slice(0, max).join(" · ");
};

/** Minimal union-find over file indices for transitive near-dup clustering. */
const makeUnionFind = (n: number) => {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) [x, parent[x]] = [parent[x], r];
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  return { find, union };
};

/** Does file `from` carry a body link resolving to file `to` (by slug)? */
const linksTo = (from: MemoryFile, to: MemoryFile): boolean =>
  from.links.some((l) => l.targetSlug === to.slug);

/** Per-file oversized reasons (>=2 H2 sections or >=8 top-level bullets). */
const oversizedReasons = (f: MemoryFile): string[] => {
  const reasons: string[] = [];
  const h2 = (f.body.match(/^## /gm) ?? []).length;
  const bullets = (f.body.match(/^- /gm) ?? []).length;
  if (h2 >= 2) reasons.push(`${h2} H2 sections`);
  if (bullets >= 8) reasons.push(`${bullets} top-level bullets`);
  return reasons;
};

/** Best-effort shingle set of the user's global ~/.claude/CLAUDE.md (null when unreadable). */
const claudeMdShingles = (): Set<string> | null => {
  try {
    const text = readFileSync(join(homedir(), ".claude", "CLAUDE.md"), "utf8");
    return toShingles(toWords(text));
  } catch {
    return null;
  }
};

/**
 * Generate all model-judgment candidate sets for a vault: near-dup clusters,
 * subsumption pairs, oversized files, contradiction hints, missing-link pairs,
 * missing Why/How, and CLAUDE.md redundancy. Deterministic: sorted by kind then
 * members. O(n²) over files is fine — vaults are tiny.
 */
export const buildCandidates = (vault: Vault): CandidateSet[] => {
  const files = vault.files;
  const n = files.length;
  const shingles = files.map((f) => toShingles(toWords(f.body)));
  const terms = files.map((f) => toTerms(toWords(f.body)));
  const out: CandidateSet[] = [];

  // Document frequency for "rare significant term" gating (contradiction).
  const df = new Map<string, number>();
  for (const t of terms) for (const w of t) df.set(w, (df.get(w) ?? 0) + 1);
  // Rare == term appears in <=2 files; when both pair members carry it, it is
  // essentially distinctive to that pair (df==2) — keeps contradiction recall modest.
  const isRare = (w: string): boolean => (df.get(w) ?? 0) <= 2;

  // Pairwise Jaccard (upper triangle), reused by several checks.
  const uf = makeUnionFind(n);
  const nearPairs: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const J = jaccard(shingles[i], shingles[j]);
      const si = shingles[i];
      const sj = shingles[j];

      // near-dup (DUP02): cluster transitively.
      if (J >= NEAR_DUP_MIN) {
        nearPairs.push([i, j, J]);
        uf.union(i, j);
      }

      // subsumption (DUP04): smaller set >=70% covered by the larger.
      if (si.size > 0 && sj.size > 0) {
        const smaller = si.size <= sj.size ? si : sj;
        const cover = intersectSize(si, sj) / smaller.size;
        if (cover >= SUBSUME_MIN && J < NEAR_DUP_MIN) {
          const members = [files[i].slug, files[j].slug].sort();
          const [subIdx, supIdx] = si.size <= sj.size ? [i, j] : [j, i];
          out.push({
            kind: "subsumption",
            check: "DUP04",
            members,
            score: cover,
            evidence: sharedEvidence(si, sj),
            note: `${files[subIdx].slug} appears largely contained in ${files[supIdx].slug}`,
          });
        }
      }

      // missing-link (LNK06): related but unlinked either way.
      if (J >= RELATED_MIN && J < NEAR_DUP_MIN && !linksTo(files[i], files[j]) && !linksTo(files[j], files[i])) {
        out.push({
          kind: "missing-link",
          check: "LNK06",
          members: [files[i].slug, files[j].slug].sort(),
          score: J,
          evidence: sharedEvidence(si, sj),
          note: "related content, no body link between them",
        });
      }

      // contradiction (CON01): >=2 shared rare terms + opposing markers across the pair.
      const sharedRare: string[] = [];
      for (const w of terms[i]) if (terms[j].has(w) && isRare(w)) sharedRare.push(w);
      if (sharedRare.length >= 2) {
        const bi = files[i].body.toLowerCase();
        const bj = files[j].body.toLowerCase();
        const opposing: string[] = [];
        for (const [x, y] of OPPOSING) {
          const count = (b: string, w: string) => (b.match(new RegExp(`\\b${w}\\b`, "g")) ?? []).length;
          // Majority polarity: a file "leans" to whichever marker it mentions more,
          // so an incidental cross-reference to the other side (a [[link]] or a "was X,
          // now Y" aside) doesn't cancel the signal. Contradiction = files lean opposite.
          const lean = (b: string): "x" | "y" | null => {
            const cx = count(b, x), cy = count(b, y);
            return cx > cy ? "x" : cy > cx ? "y" : null;
          };
          const li = lean(bi), lj = lean(bj);
          if (li && lj && li !== lj) opposing.push(`${x}/${y}`);
        }
        if (opposing.length > 0) {
          out.push({
            kind: "contradiction",
            check: "CON01",
            members: [files[i].slug, files[j].slug].sort(),
            score: 0.3,
            evidence: sharedRare.sort().slice(0, 4).join(", "),
            note: `opposing markers ${opposing.join(", ")}; shared terms ${sharedRare.sort().slice(0, 3).join(", ")}`,
          });
        }
      }
    }
  }

  // near-dup clusters from union-find roots.
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (nearPairs.some(([a, b]) => a === i || b === i)) {
      const r = uf.find(i);
      (clusters.get(r) ?? clusters.set(r, []).get(r)!).push(i);
    }
  }
  for (const idxs of clusters.values()) {
    if (idxs.length < 2) continue;
    const maxJ = Math.max(...nearPairs.filter(([a, b]) => idxs.includes(a) && idxs.includes(b)).map(([, , J]) => J));
    // Shingles shared by >=2 cluster members, for evidence.
    const counts = new Map<string, number>();
    for (const idx of idxs) for (const sh of shingles[idx]) counts.set(sh, (counts.get(sh) ?? 0) + 1);
    const evidence = [...counts.entries()].filter(([, c]) => c >= 2).map(([s]) => s).sort().slice(0, 3).join(" · ");
    out.push({
      kind: "near-dup",
      check: "DUP02",
      members: idxs.map((i) => files[i].slug).sort(),
      score: maxJ,
      evidence,
      note: `${idxs.length} files share overlapping content`,
    });
  }

  // oversized (SIZ01): per-file.
  for (const f of files) {
    const reasons = oversizedReasons(f);
    if (reasons.length > 0) {
      out.push({ kind: "oversized", check: "SIZ01", members: [f.slug], note: reasons.join("; ") });
    }
  }

  // missing-why-how (SCH05/06): feedback/project files missing Why; feedback files
  // also need How to apply (optional for project files, which are reference notes).
  for (const f of files) {
    const type = f.frontmatter.type;
    if (type !== "feedback" && type !== "project") continue;
    const missing: string[] = [];
    if (!f.hasWhy) missing.push("Why");
    if (type === "feedback" && !f.hasHowToApply) missing.push("How to apply");
    if (missing.length > 0) {
      out.push({
        kind: "missing-why-how",
        check: "SCH05",
        members: [f.slug],
        note: `missing ${missing.join(" + ")}`,
      });
    }
  }

  // redundancy (RED01): overlap with the user's global CLAUDE.md.
  const claude = claudeMdShingles();
  if (claude && claude.size > 0) {
    files.forEach((f, i) => {
      const J = jaccard(shingles[i], claude);
      if (J >= REDUNDANCY_MIN) {
        out.push({
          kind: "redundancy",
          check: "RED01",
          members: [f.slug],
          score: J,
          evidence: sharedEvidence(shingles[i], claude),
          note: "overlaps ~/.claude/CLAUDE.md",
        });
      }
    });
  }

  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.members.join(",").localeCompare(b.members.join(",")));
};
