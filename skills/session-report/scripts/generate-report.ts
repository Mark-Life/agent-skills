#!/usr/bin/env -S node --experimental-strip-types
/**
 * Generate a self-contained HTML context-debugging report for a Claude Code session.
 *
 * Runtime: zero build step. Runs on Node >=22.18 / >=23.6 (native TS type-stripping)
 * or Bun. For older Node, use `npx tsx generate-report.ts ...`.
 *
 * Usage:
 *   bun run generate-report.ts <session-id | path/to/session.jsonl> [options]
 *   node generate-report.ts    <session-id | path/to/session.jsonl> [options]
 *
 * Options:
 *   --out <file>        output HTML path (default: ./ccx-<id>.html)
 *   --window <tokens>   context window override (default: inferred 200K/1M)
 *   --dumb-zone <frac>  degradation threshold as fraction of window (default 0.40)
 *   --no-subagents      skip parsing subagent transcripts
 *   --open              open the report in the default browser when done
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { resolveClaudeSession, findSubagents, gatherOnDiskContextFiles } from "./lib/resolve.ts";
import { parseClaudeSession } from "./lib/parse.ts";
import { resolveCodexSession, parseCodexSession, isCodexFile } from "./lib/codex.ts";
import { analyze } from "./lib/analyze.ts";
import { renderReport } from "./lib/render.ts";
import type { ParsedSession, SubagentRef } from "./lib/types.ts";

interface Args {
  target?: string;
  out?: string;
  window?: number;
  dumbZone?: number;
  noSubagents: boolean;
  open: boolean;
  codex: boolean;
}

const parseArgs = (argv: string[]): Args => {
  const a: Args = { noSubagents: false, open: false, codex: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") a.out = argv[++i];
    else if (arg === "--window") a.window = Number(argv[++i]);
    else if (arg === "--dumb-zone") a.dumbZone = Number(argv[++i]);
    else if (arg === "--no-subagents") a.noSubagents = true;
    else if (arg === "--open") a.open = true;
    else if (arg === "--codex") a.codex = true;
    else if (!arg.startsWith("--") && !a.target) a.target = arg;
  }
  return a;
};

/** Parse a subagent transcript into a lightweight SubagentRef with metrics. */
const analyzeSubagent = (ref: Omit<SubagentRef, "turns" | "peakContextTokens">): SubagentRef => {
  try {
    const p = parseClaudeSession(ref.path, ref.id);
    const peak = p.turns.reduce((m, t) => Math.max(m, t.contextTokens), 0);
    return { ...ref, turns: p.turns.length, peakContextTokens: peak };
  } catch (err) {
    console.error(`  warning: failed to parse subagent ${ref.id}: ${err instanceof Error ? err.message : String(err)}`);
    return { ...ref, turns: 0, peakContextTokens: 0 };
  }
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error("Usage: bun run generate-report.ts <session-id | path.jsonl> [--out f] [--window n] [--dumb-zone f] [--no-subagents] [--codex] [--open]");
    process.exit(1);
  }

  // Detect provider: explicit --codex, a path that looks like a Codex rollout,
  // or a Claude Code transcript whose first line is a Codex session_meta.
  const looksCodex =
    args.codex ||
    args.target.includes("rollout-") ||
    args.target.includes(".codex/") ||
    (args.target.endsWith(".jsonl") && isCodexFile(args.target));

  let parsed: ParsedSession;
  let subagentDir: string | undefined;
  if (looksCodex) {
    const r = resolveCodexSession(args.target);
    console.error(`Reading Codex rollout ${r.path}`);
    parsed = parseCodexSession(r.path, r.sessionId);
  } else {
    const r = resolveClaudeSession(args.target);
    subagentDir = r.subagentDir;
    console.error(`Reading ${r.path}`);
    parsed = parseClaudeSession(r.path, r.sessionId);
  }

  if (!args.noSubagents && subagentDir) {
    // Sort deterministically (biggest first) — readdir order varies by runtime/FS.
    parsed.subagents = findSubagents(subagentDir)
      .map(analyzeSubagent)
      .sort((a, b) => b.peakContextTokens - a.peakContextTokens || a.id.localeCompare(b.id));
  }

  const onDiskContextFiles = gatherOnDiskContextFiles(parsed.cwd);
  const analyzed = analyze(parsed, {
    window: args.window,
    dumbZoneFraction: args.dumbZone,
    onDiskContextFiles,
  });

  const html = renderReport(analyzed);
  const out = args.out ?? join(process.cwd(), `ccx-${parsed.sessionId.slice(0, 8)}.html`);
  writeFileSync(out, html, "utf8");

  console.error(
    `\nReport: ${out}\n` +
      `  turns=${analyzed.turnCount}  peak=${analyzed.peakContextTokens.toLocaleString()} ` +
      `(${(100 * analyzed.peakContextTokens / analyzed.contextWindow).toFixed(0)}% of ${analyzed.contextWindow.toLocaleString()})  ` +
      `dumb-zone@turn=${analyzed.dumbZoneCrossTurn >= 0 ? analyzed.dumbZoneCrossTurn + 1 : "never"}  ` +
      `subagents=${analyzed.subagents.length}`,
  );
  console.log(out);

  if (args.open) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    // node:child_process works on both Node and Bun (Bun.spawn would be Bun-only).
    spawn(opener, [out], { stdio: "ignore", detached: true }).unref();
  }
};

main();
