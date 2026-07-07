/** Resolve a project argument (or the cwd) to its per-project memory dir, and
 * discover every other project on the machine that has memory.
 *
 * Topology (documented): memory lives at `~/.claude/projects/<slug>/memory/`,
 * where `<slug>` is the cwd with `/` and `.` both replaced by `-`. The slug derives
 * from the git repo root, so all worktrees/subdirs of one repo share one memory dir.
 * There is NO global store — "no memory dir" is the common case, not an error.
 */
import { readdirSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import type { ProjectRef } from "./types.ts";

const HOME = homedir();
export const CLAUDE_PROJECTS = join(HOME, ".claude", "projects");

/** Documented encoding: forward slashes AND periods both become dashes. */
export const encodeSlug = (cwdPath: string): string => cwdPath.replace(/[/.]/g, "-");

/** Resolve the git repo root for a directory, falling back to the dir itself. */
export const gitRoot = (cwd: string): string => {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim() || cwd;
  } catch {
    return cwd;
  }
};

/** True when `name` looks like an encoded project slug (leading dash). */
const looksLikeSlug = (name: string): boolean => name.startsWith("-") && !name.includes("/");

/** Markers that identify a code/project root (so we encode it rather than treat it as a vault). */
const PROJECT_MARKERS = new Set([
  "package.json", ".git", "node_modules", "tsconfig.json", "Cargo.toml", "go.mod", "pyproject.toml", "src",
]);

/**
 * True when a directory IS a memory vault rather than a code project: it is named
 * `memory`, contains a `MEMORY.md` index, or holds markdown files and shows no
 * project-root markers (e.g. a fixture or an exported vault).
 */
const looksLikeMemoryDir = (dir: string): boolean => {
  if (basename(dir) === "memory") return true;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return false;
  }
  if (names.includes("MEMORY.md")) return true;
  const hasMd = names.some((n) => n.endsWith(".md"));
  const looksLikeProject = names.some((n) => PROJECT_MARKERS.has(n));
  return hasMd && !looksLikeProject;
};

/** Count `.md` content files (excluding MEMORY.md) and detect an index in a memory dir. */
const summarizeDir = (memoryDir: string): { fileCount: number; hasIndex: boolean } => {
  let fileCount = 0;
  let hasIndex = false;
  try {
    for (const e of readdirSync(memoryDir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      if (e.name === "MEMORY.md") hasIndex = true;
      else if (e.name.endsWith(".md")) fileCount++;
    }
  } catch {
    /* unreadable dir */
  }
  return { fileCount, hasIndex };
};

/** Longest common leading substring across slugs (the shared home prefix). */
const commonPrefix = (slugs: string[]): string => {
  if (slugs.length === 0) return "";
  let pre = slugs[0];
  for (const s of slugs) {
    let i = 0;
    while (i < pre.length && i < s.length && pre[i] === s[i]) i++;
    pre = pre.slice(0, i);
    if (!pre) break;
  }
  return pre;
};

/** Strip the shared home prefix for a readable label; fall back to the raw slug. */
const prettyLabel = (slug: string, prefix: string): string => {
  const stripped = prefix && slug.startsWith(prefix) ? slug.slice(prefix.length) : slug.replace(/^-/, "");
  return stripped || slug;
};

/**
 * List every project under ~/.claude/projects that has a non-empty memory dir,
 * sorted by file count (desc) then slug. Used for dead-end pivots and `--all`.
 */
export const listProjectsWithMemory = (): ProjectRef[] => {
  if (!existsSync(CLAUDE_PROJECTS)) return [];
  const withMem: { slug: string; memoryDir: string; fileCount: number; hasIndex: boolean }[] = [];
  for (const slug of readdirSync(CLAUDE_PROJECTS)) {
    const memoryDir = join(CLAUDE_PROJECTS, slug, "memory");
    if (!existsSync(memoryDir)) continue;
    const { fileCount, hasIndex } = summarizeDir(memoryDir);
    if (fileCount === 0 && !hasIndex) continue; // empty cruft dirs are not "projects with memory"
    withMem.push({ slug, memoryDir, fileCount, hasIndex });
  }
  const prefix = commonPrefix(withMem.map((w) => w.slug));
  return withMem
    .map((w) => ({ ...w, project: prettyLabel(w.slug, prefix) }))
    .sort((a, b) => b.fileCount - a.fileCount || a.slug.localeCompare(b.slug));
};

export interface ResolvedTarget {
  slug: string;
  project: string;
  memoryDir: string;
  /** true when the memory dir exists on disk (may still be empty). */
  exists: boolean;
}

/**
 * Resolve a project argument to its memory dir. Accepts: a memory-dir path, a
 * project slug, an absolute cwd path, or a bare project name; omitted → resolve
 * from process.cwd()'s git root. Always returns a target (existence is a flag),
 * so callers render the dead-end states rather than throwing.
 */
export const resolveTarget = (projectArg?: string): ResolvedTarget => {
  // 1. An explicit filesystem path → a memory dir, a project dir, or a cwd.
  if (projectArg && (projectArg.includes("/") || isDir(projectArg))) {
    let dir = projectArg.replace(/\/+$/, "");
    // A project dir whose memory lives in a child memory/ → descend into it.
    if (isDir(join(dir, "memory")) && !looksLikeMemoryDir(dir)) dir = join(dir, "memory");
    if (isDir(dir)) {
      if (looksLikeMemoryDir(dir)) {
        // Use the dir itself as the memory dir (fixtures, an exported vault, a …/memory path).
        const slug = basename(dir) === "memory" ? basename(dirname(dir)) : basename(dir);
        return { slug, project: deriveProject(slug), memoryDir: dir, exists: true };
      }
      // A code/project directory → encode its git root to the projects slug.
      const root = gitRoot(dir);
      const slug = encodeSlug(root);
      const memoryDir = join(CLAUDE_PROJECTS, slug, "memory");
      return { slug, project: basename(root), memoryDir, exists: existsSync(memoryDir) };
    }
  }

  // 2. An explicit project slug (leading dash, exists under projects).
  if (projectArg && looksLikeSlug(projectArg)) {
    const memoryDir = join(CLAUDE_PROJECTS, projectArg, "memory");
    return { slug: projectArg, project: deriveProject(projectArg), memoryDir, exists: existsSync(memoryDir) };
  }

  // 3. A bare project name → match against known slugs (suffix, then substring).
  if (projectArg && existsSync(CLAUDE_PROJECTS)) {
    const all = readdirSync(CLAUDE_PROJECTS);
    const needle = projectArg.toLowerCase();
    const suffix = all.find((s) => s.toLowerCase().endsWith(`-${needle}`));
    const sub = suffix ?? all.find((s) => s.toLowerCase().includes(needle));
    if (sub) {
      const memoryDir = join(CLAUDE_PROJECTS, sub, "memory");
      return { slug: sub, project: deriveProject(sub), memoryDir, exists: existsSync(memoryDir) };
    }
    // No match → still return a best-effort encoded target so the dead-end UI lists alternatives.
    const slug = encodeSlug(projectArg);
    return { slug, project: projectArg, memoryDir: join(CLAUDE_PROJECTS, slug, "memory"), exists: false };
  }

  // 4. No argument → resolve from cwd's git root.
  const root = gitRoot(process.cwd());
  const slug = encodeSlug(root);
  return {
    slug,
    project: basename(root),
    memoryDir: join(CLAUDE_PROJECTS, slug, "memory"),
    exists: existsSync(join(CLAUDE_PROJECTS, slug, "memory")),
  };
};

/** Best-effort display name for a slug we only know by its encoded form. */
const deriveProject = (slug: string): string => {
  const all = existsSync(CLAUDE_PROJECTS) ? readdirSync(CLAUDE_PROJECTS) : [];
  const prefix = commonPrefix(all.filter(looksLikeSlug));
  return prettyLabel(slug, prefix);
};

/** True when a path exists and is a directory. */
export const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
