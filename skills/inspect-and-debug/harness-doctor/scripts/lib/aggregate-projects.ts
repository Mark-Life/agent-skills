/**
 * The `projects` section: per project, what it cost and what sits on disk beside it.
 *
 * This is the only part of the aggregate that touches the filesystem. It reads
 * package.json for the package manager and the script NAMES: never their contents,
 * and never any other file's contents.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commandFamilies } from "./aggregate-commands.ts";
import { bump, groupBy, ranking, round, sum, topKey, uniqSorted } from "./stats.ts";
import type {
  BashRow,
  ProjectOnDisk,
  ProjectReportRow,
  SessionRow,
  TokenTotals,
} from "./types.ts";

/** Token and cost maths handed in by the caller, so this module stays fs-only. */
export interface ProjectMetrics {
  totalsOf: (sessions: readonly SessionRow[]) => TokenTotals;
  costOf: (sessions: readonly SessionRow[]) => number;
}

/** Lockfiles that name a package manager, checked in this order. */
const LOCKFILES: readonly (readonly [string, string])[] = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

/**
 * What sits on disk next to a project's cwd: which rules files exist, plus the
 * package manager and script names from package.json. A missing or unreadable
 * directory yields all-false rather than an error.
 */
export const probeDisk = (cwd: string | undefined, check: boolean): ProjectOnDisk => {
  const base: ProjectOnDisk = {
    ...(cwd === undefined ? {} : { cwd }),
    claudeMd: false,
    agentsMd: false,
    settingsJson: false,
    packageJson: false,
    scriptNames: [],
  };
  if (!cwd || !check || !existsSync(cwd)) return base;
  const pkgPath = join(cwd, "package.json");
  const out: ProjectOnDisk = {
    ...base,
    claudeMd: existsSync(join(cwd, "CLAUDE.md")),
    agentsMd: existsSync(join(cwd, "AGENTS.md")),
    settingsJson: existsSync(join(cwd, ".claude", "settings.json")),
    packageJson: existsSync(pkgPath),
  };
  if (!out.packageJson) return out;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      packageManager?: unknown;
      scripts?: unknown;
    };
    const declared =
      typeof pkg.packageManager === "string"
        ? pkg.packageManager.split("@")[0]
        : undefined;
    const manager =
      declared || LOCKFILES.find(([file]) => existsSync(join(cwd, file)))?.[1];
    const scripts = pkg.scripts;
    return {
      ...out,
      ...(manager ? { packageManager: manager } : {}),
      scriptNames:
        typeof scripts === "object" && scripts !== null
          ? uniqSorted(Object.keys(scripts as Record<string, unknown>))
          : [],
    };
  } catch {
    return out;
  }
};

/**
 * Per project: sessions, tokens, estimated cost, bash seconds, the five costliest
 * command families, and the rules files found at the project's most common cwd.
 */
export const projectsSection = (
  sessions: readonly SessionRow[],
  bash: readonly BashRow[],
  top: number,
  checkDisk: boolean,
  metrics: ProjectMetrics,
) => {
  const bashByProj = groupBy(bash, (b) => b.proj);
  const rows: ProjectReportRow[] = [...groupBy(sessions, (s) => s.proj)].map(
    ([proj, group]) => {
      const cwds = new Map<string, number>();
      for (const s of group) if (s.cwd) bump(cwds, s.cwd);
      const projBash = bashByProj.get(proj) ?? [];
      const families = commandFamilies(projBash);
      return {
        proj,
        sessions: group.length,
        totals: metrics.totalsOf(group),
        estCostUsd: round(metrics.costOf(group), 4),
        bashSec: round(sum(projBash, (b) => b.durSec ?? 0), 1),
        topCommands: ranking(families, (f) => f.totalSec, (f) => f.family, 5).rows,
        onDisk: probeDisk(cwds.size > 0 ? topKey(cwds) : undefined, checkDisk),
      };
    },
  );
  const total = (t: TokenTotals) => t.in + t.out + t.cacheRead + t.cacheCreate;
  return ranking(rows, (r) => total(r.totals), (r) => r.proj, top);
};
