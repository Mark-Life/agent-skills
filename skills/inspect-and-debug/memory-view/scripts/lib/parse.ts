/** Build the in-memory Vault model from a project's memory dir.
 *
 * The single reader of the whole vault: parses every topic file + the MEMORY.md
 * index, classifies the dir state (ok / absent / empty / monolithic), and is
 * long-line safe (real bodies pack single paragraphs up to ~1,600 chars/line).
 */
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import type {
  Vault,
  MemoryFile,
  MemoryIndex,
  IndexEntry,
  LinkRef,
  VaultState,
} from "./types.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { listProjectsWithMemory, type ResolvedTarget } from "./resolve.ts";

const MAX_INDEX_LINES = 200;
const MAX_INDEX_BYTES = 25 * 1024;

/** Normalize a link/target string to a comparable slug stem. */
export const normalizeSlug = (target: string): string =>
  target
    .trim()
    .replace(/#.*$/, "") // drop anchor
    .replace(/\|.*$/, "") // drop wiki alias
    .replace(/\.md$/i, "")
    .split("/")
    .pop()!
    .trim()
    .toLowerCase();

/** Extract `[[wiki]]` and `[label](target.md)` links from a body, with line numbers. */
const extractLinks = (body: string): LinkRef[] => {
  const links: LinkRef[] = [];
  const lines = body.split("\n");
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    for (const m of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
      links.push({ kind: "wiki", rawTarget: m[1], targetSlug: normalizeSlug(m[1]), line: lineNo });
    }
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = m[1].trim();
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href) || href.startsWith("#")) continue; // external/anchor
      links.push({ kind: "markdown", rawTarget: href, targetSlug: normalizeSlug(href), line: lineNo });
    }
  });
  return links;
};

/** Hash of the normalized body (lowercased, whitespace-collapsed) for exact-dup detection. */
const hashBody = (body: string): string =>
  createHash("sha1").update(body.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");

/** Parse one topic file into a MemoryFile. */
export const parseMemoryFile = (path: string): MemoryFile => {
  const text = readFileSync(path, "utf8");
  const { frontmatter, body } = parseFrontmatter(text);
  const fileName = basename(path);
  let mtime = "";
  try {
    mtime = statSync(path).mtime.toISOString();
  } catch {
    /* ignore */
  }
  const allLines = text.split(/\r?\n/);
  return {
    fileName,
    slug: fileName.replace(/\.md$/i, ""),
    path,
    bytes: Buffer.byteLength(text, "utf8"),
    lines: allLines.length,
    mtime,
    frontmatter,
    body,
    bodyHash: hashBody(body),
    links: extractLinks(body),
    hasWhy: /(\*\*\s*Why\s*:?\s*\*\*|^\s*Why\s*:)/im.test(body),
    hasHowToApply: /\*\*\s*How to apply\b[^*\n]*\*\*|^\s*How to apply\b[^:\n]*:/im.test(body),
    maxLineLength: allLines.reduce((m, l) => Math.max(m, l.length), 0),
  };
};

/** Parse a single MEMORY.md line into an IndexEntry. */
const parseIndexLine = (raw: string, lineNumber: number): IndexEntry | null => {
  if (raw.trim() === "") return null;
  const sep = "(?:—|–|·|-{1,2})";
  const md = raw.match(new RegExp(`^\\s*[-*]\\s+\\[([^\\]]+)\\]\\(([^)]+)\\)\\s*(?:${sep}\\s*(.*))?$`));
  if (md) {
    return {
      raw,
      lineNumber,
      label: md[1].trim(),
      target: md[2].trim(),
      targetSlug: normalizeSlug(md[2]),
      hook: md[3]?.trim() || undefined,
      malformed: false,
      kind: "markdown",
    };
  }
  const wiki = raw.match(new RegExp(`^\\s*[-*]\\s+\\[\\[([^\\]]+)\\]\\]\\s*(?:${sep}\\s*(.*))?$`));
  if (wiki) {
    return {
      raw,
      lineNumber,
      label: wiki[1].trim(),
      target: wiki[1].trim(),
      targetSlug: normalizeSlug(wiki[1]),
      hook: wiki[2]?.trim() || undefined,
      malformed: false,
      kind: "wiki",
    };
  }
  // A bullet that isn't a recognizable link entry.
  if (/^\s*[-*]\s+\S/.test(raw)) {
    return { raw, lineNumber, malformed: true, kind: "bare" };
  }
  return null; // headings / prose lines are not entries
};

/** Parse the MEMORY.md index, detecting the monolithic-prose case and budget overflow. */
export const parseIndex = (memoryDir: string): MemoryIndex | null => {
  const path = join(memoryDir, "MEMORY.md");
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const bytes = Buffer.byteLength(raw, "utf8");
  const rawLines = raw.split(/\r?\n/);
  const lines = rawLines.length;

  const entries: IndexEntry[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const e = parseIndexLine(rawLines[i], i + 1);
    if (e) entries.push(e);
  }

  const linkEntries = entries.filter((e) => e.targetSlug);
  const hasHeadings = /(^|\n)#{1,6}\s/.test(raw);
  const isMonolithic = raw.trim().length > 0 && linkEntries.length === 0 && hasHeadings;

  // Budget: which entries fall past the 200-line / 25 KB cliff.
  const belowFoldEntries: IndexEntry[] = [];
  let byteOffset = 0;
  const lineBytes = rawLines.map((l) => Buffer.byteLength(l + "\n", "utf8"));
  for (const e of entries) {
    byteOffset = lineBytes.slice(0, e.lineNumber - 1).reduce((s, b) => s + b, 0);
    if (e.lineNumber > MAX_INDEX_LINES || byteOffset >= MAX_INDEX_BYTES) belowFoldEntries.push(e);
  }

  return {
    exists: true,
    path,
    raw,
    bytes,
    lines,
    entries,
    isMonolithic,
    overBudget: lines > MAX_INDEX_LINES || bytes > MAX_INDEX_BYTES,
    belowFoldEntries,
  };
};

/** Classify the overall vault state. */
const classifyState = (exists: boolean, files: MemoryFile[], index: MemoryIndex | null): VaultState => {
  if (!exists) return "absent";
  if (index?.isMonolithic) return "monolithic";
  if (files.length === 0 && (!index || !index.exists)) return "empty";
  return "ok";
};

/**
 * Build the full Vault model for a resolved target. Always returns a Vault
 * (dead-end states are data, not errors). `otherProjects` lists every other
 * project on the machine with memory, for pivot UX.
 */
export const parseVault = (target: ResolvedTarget): Vault => {
  const { slug, project, memoryDir, exists } = target;
  const files: MemoryFile[] = [];
  const strayFiles: string[] = [];

  if (exists) {
    const entries = readdirSync(memoryDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (e.name === "MEMORY.md") continue;
      if (e.name.endsWith(".md")) {
        try {
          files.push(parseMemoryFile(join(memoryDir, e.name)));
        } catch {
          /* skip unreadable file */
        }
      } else {
        strayFiles.push(e.name);
      }
    }
  }

  const index = exists ? parseIndex(memoryDir) : null;
  const state = classifyState(exists, files, index);
  const otherProjects = listProjectsWithMemory().filter((p) => p.slug !== slug);

  return { slug, project, memoryDir, state, index, files, strayFiles, otherProjects };
};
