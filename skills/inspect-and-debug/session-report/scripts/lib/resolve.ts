/** Locate a session transcript by id and gather companion files from disk. */
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OnDiskContextFile, SubagentRef } from "./types.ts";
import { estTokens } from "./tokens.ts";

const HOME = homedir();
const CLAUDE_PROJECTS = join(HOME, ".claude", "projects");

export interface ResolvedSession {
  provider: "claude-code" | "codex";
  sessionId: string;
  path: string;
  projectDir: string;
  subagentDir?: string;
}

/** True when `name` looks like a session UUID (with or without .jsonl). */
const looksLikeId = (name: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(name);

/**
 * Resolve a Claude Code session by id (or a direct .jsonl path) to its
 * transcript file, searching every project dir under ~/.claude/projects.
 */
export const resolveClaudeSession = (idOrPath: string): ResolvedSession => {
  // Direct path to a .jsonl file.
  if (idOrPath.endsWith(".jsonl") && existsSync(idOrPath)) {
    const sessionId = idOrPath.split("/").pop()!.replace(/\.jsonl$/, "");
    const projectDir = idOrPath.slice(0, idOrPath.lastIndexOf("/"));
    const subagentDir = join(projectDir, sessionId, "subagents");
    return {
      provider: "claude-code",
      sessionId,
      path: idOrPath,
      projectDir,
      subagentDir: existsSync(subagentDir) ? subagentDir : undefined,
    };
  }

  const id = idOrPath.replace(/\.jsonl$/, "");
  if (!existsSync(CLAUDE_PROJECTS)) {
    throw new Error(`No Claude projects dir at ${CLAUDE_PROJECTS}`);
  }
  for (const project of readdirSync(CLAUDE_PROJECTS)) {
    const candidate = join(CLAUDE_PROJECTS, project, `${id}.jsonl`);
    if (existsSync(candidate)) {
      const subagentDir = join(CLAUDE_PROJECTS, project, id, "subagents");
      return {
        provider: "claude-code",
        sessionId: id,
        path: candidate,
        projectDir: join(CLAUDE_PROJECTS, project),
        subagentDir: existsSync(subagentDir) ? subagentDir : undefined,
      };
    }
  }
  throw new Error(
    `Session ${id} not found under ${CLAUDE_PROJECTS}. ` +
      `Pass a full .jsonl path if it lives elsewhere.`,
  );
};

/**
 * Discover subagent transcripts for a session, recursing the subagents/ tree
 * (subagents nest as subagents/workflows/<wf>/agent-*.jsonl). Only agent-*.jsonl
 * files are returned; sibling workflows/scripts/ and journal files are ignored.
 */
export type SubagentStub = Omit<SubagentRef, "turns" | "peakContextTokens">;

export const findSubagents = (subagentDir?: string): SubagentStub[] => {
  if (!subagentDir || !existsSync(subagentDir)) return [];
  const out: SubagentStub[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile() && /^agent-.*\.jsonl$/.test(entry.name)) {
        const id = entry.name.replace(/\.jsonl$/, "");
        let meta: Record<string, unknown> = {};
        const metaPath = join(dir, `${id}.meta.json`);
        if (existsSync(metaPath)) {
          try {
            meta = JSON.parse(readFileSync(metaPath, "utf8"));
          } catch {
            /* ignore malformed meta */
          }
        }
        out.push({
          id,
          agentType: meta.agentType as string | undefined,
          description: meta.description as string | undefined,
          toolUseId: meta.toolUseId as string | undefined,
          path,
        });
      }
    }
  };
  walk(subagentDir);
  return out;
};

/** Read one context file from disk into an OnDiskContextFile, or null if absent. */
const readContextFile = (
  path: string,
  label: string,
  scope: OnDiskContextFile["scope"],
): OnDiskContextFile | null => {
  if (!existsSync(path)) return null;
  let bytes = 0;
  try {
    bytes = statSync(path).size;
  } catch {
    return null;
  }
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    /* size-only fallback */
  }
  return { label, path, bytes, tokensEst: text ? estTokens(text) : Math.round(bytes / 4), scope };
};

/**
 * Gather the CLAUDE.md / AGENTS.md / memory files that would be injected into
 * the system prompt for `cwd` — used to attribute the system+tools residual.
 */
export const gatherOnDiskContextFiles = (cwd?: string): OnDiskContextFile[] => {
  const files: OnDiskContextFile[] = [];
  const push = (f: OnDiskContextFile | null) => {
    if (f) files.push(f);
  };

  push(readContextFile(join(HOME, ".claude", "CLAUDE.md"), "~/.claude/CLAUDE.md (global)", "global"));

  if (cwd) {
    push(readContextFile(join(cwd, "CLAUDE.md"), `${cwd}/CLAUDE.md`, "project"));
    push(readContextFile(join(cwd, "AGENTS.md"), `${cwd}/AGENTS.md`, "project"));
    push(readContextFile(join(cwd, ".claude", "CLAUDE.md"), `${cwd}/.claude/CLAUDE.md`, "project"));
  }

  // Per-project memory dir under ~/.claude/projects/<encoded-cwd>/memory.
  if (cwd) {
    const encoded = cwd.replace(/[/.]/g, "-");
    const memDir = join(CLAUDE_PROJECTS, encoded, "memory");
    if (existsSync(memDir)) {
      let total = 0;
      let count = 0;
      const walk = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.isFile()) {
            try {
              total += statSync(p).size;
              count++;
            } catch {
              /* ignore */
            }
          }
        }
      };
      walk(memDir);
      if (count > 0) {
        files.push({
          label: `memory/ (${count} file${count === 1 ? "" : "s"})`,
          path: memDir,
          bytes: total,
          tokensEst: Math.round(total / 4),
          scope: "memory",
        });
      }
    }
  }

  return files;
};
