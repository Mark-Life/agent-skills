#!/usr/bin/env -S node --experimental-strip-types
/**
 * memory-view — view, audit, and safely curate Claude Code's per-project auto-memory.
 *
 * A zero-dependency TypeScript orchestrator: one read pass over the vault produces
 * a self-contained HTML explorer + audit report (for humans) and a versioned
 * findings.json (for the model to propose approval-gated fixes). The script is
 * read-only "scan + render" plus two explicit deterministic write subcommands
 * (--reindex, --snapshot) and a restore (--undo); all CONTENT edits are model-driven.
 *
 * Runtime: zero build step. Node >= 22.18 / >= 23.6 (native TS type-stripping) or Bun.
 * For older Node: `npx tsx scan-memory.ts ...`.
 *
 * Usage:
 *   node scan-memory.ts                       # DEFAULT: all-projects explorer
 *   node scan-memory.ts [project] --view       # single-project dashboard (--view | -p | --project)
 *   node scan-memory.ts [project] --audit       # single-project audit (+ --json)
 *   node scan-memory.ts [project] --reindex|--validate|--snapshot|--undo <ts>
 *
 * A bare positional project (e.g. `scan-memory.ts pickart`) implies single-project view.
 */
import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync, statSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { spawn } from "node:child_process";
import { resolveTarget, listProjectsWithMemory } from "./lib/resolve.ts";
import { parseVault } from "./lib/parse.ts";
import { buildGraph } from "./lib/graph.ts";
import { runAudit } from "./lib/audit.ts";
import { buildCandidates } from "./lib/candidates.ts";
import { assembleVault, serializeFindings } from "./lib/findings.ts";
import { buildCanonicalIndex, validateVault } from "./lib/reindex.ts";
import { redactVault } from "./lib/redact.ts";
import { renderReport } from "./lib/render.ts";
import { renderAllReport } from "./lib/render-all.ts";
import type { AnalyzedVault, Finding, Severity } from "./lib/types.ts";

type Mode = "view" | "audit" | "reindex" | "validate" | "all" | "undo" | "snapshot" | "help";

interface Args {
  project?: string;
  mode: Mode;
  out?: string;
  findings?: string;
  open: boolean;
  redact: boolean;
  severity: Severity;
  json: boolean;
  backupDir?: string;
  undoTs?: string;
}

const SEV_RANK: Record<Severity, number> = { low: 0, med: 1, high: 2, critical: 3 };

/** Hand-rolled arg parser mirroring session-report's shape.
 *
 * Default mode is the all-projects explorer. Single-project view is opted into
 * with `--view`/`-p`/`--project`, or implied when a bare positional project is
 * given. Any explicit mode flag (audit/reindex/…) wins and is single-project. */
const parseArgs = (argv: string[]): Args => {
  const a: Args = { mode: "all", open: false, redact: true, severity: "low", json: false };
  let explicitMode = false;
  const setMode = (m: Mode) => {
    a.mode = m;
    explicitMode = true;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--view" || arg === "--project" || arg === "-p") setMode("view");
    else if (arg === "--audit") setMode("audit");
    else if (arg === "--reindex") setMode("reindex");
    else if (arg === "--validate") setMode("validate");
    else if (arg === "--all") setMode("all");
    else if (arg === "--snapshot") setMode("snapshot");
    else if (arg === "--undo") {
      setMode("undo");
      a.undoTs = argv[++i];
    } else if (arg === "--out") a.out = argv[++i];
    else if (arg === "--findings") a.findings = argv[++i];
    else if (arg === "--open") a.open = true;
    else if (arg === "--no-redact") a.redact = false;
    else if (arg === "--severity") a.severity = argv[++i] as Severity;
    else if (arg === "--json") a.json = true;
    else if (arg === "--backup-dir") a.backupDir = argv[++i];
    else if (arg === "--help" || arg === "-h") setMode("help");
    else if (!arg.startsWith("--") && !a.project) a.project = arg;
  }
  // A named project with no explicit mode means "view that project", not "--all".
  if (!explicitMode) a.mode = a.project ? "view" : "all";
  return a;
};

/** A filesystem-safe timestamp, e.g. 20260626-141233. */
const stamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Copy every file in a memory dir (one level + nested, excluding existing backups) into dest. */
const copyTree = (src: string, dest: string): number => {
  mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.name === ".curator-backups") continue;
    const from = join(src, e.name);
    const to = join(dest, e.name);
    if (e.isDirectory()) n += copyTree(from, to);
    else if (e.isFile()) {
      writeFileSync(to, readFileSync(from));
      n++;
    }
  }
  return n;
};

/** Snapshot the whole memory dir to .curator-backups/<ts>/ before any write. */
const snapshot = (memoryDir: string, backupDir: string | undefined): string => {
  const ts = stamp();
  const dest = backupDir ?? join(memoryDir, ".curator-backups", ts);
  copyTree(memoryDir, dest);
  return dest;
};

/** Full scan → analyzed (optionally redacted) vault. */
const scan = (project: string | undefined, redact: boolean): AnalyzedVault => {
  const target = resolveTarget(project);
  const vault = parseVault(target);
  const graph = buildGraph(vault);
  const findings = runAudit(vault, graph);
  const candidates = vault.files.length ? buildCandidates(vault) : [];
  const av = assembleVault(vault, graph, findings, candidates);
  av.generatedAt = new Date().toISOString();
  return redact ? redactVault(av) : av;
};

/** Drop findings below the requested minimum severity. */
const filterSeverity = (findings: Finding[], min: Severity): Finding[] =>
  findings.filter((f) => SEV_RANK[f.severity] >= SEV_RANK[min]);

/** Open a path in the default browser (cross-platform, detached). */
const openInBrowser = (path: string): void => {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(opener, [path], { stdio: "ignore", detached: true }).unref();
};

/** stderr WARNING about embedded content / redaction posture. */
const warnSecrets = (redact: boolean): void => {
  console.error(
    redact
      ? "  WARNING: this report embeds raw memory bodies and may contain secrets even after best-effort redaction — review before sharing."
      : "  WARNING: redaction DISABLED (--no-redact) — this file embeds raw memory verbatim and likely contains secrets. Do NOT share without reviewing.",
  );
};

const USAGE = [
  "memory-view — view, audit, and safely curate Claude Code's per-project auto-memory.",
  "",
  "Usage:",
  "  node scan-memory.ts                      DEFAULT: all-projects explorer (every memory, grouped by project)",
  "  node scan-memory.ts [project] --view     single-project dashboard  (aliases: -p, --project)",
  "  node scan-memory.ts [project]            bare project name ⇒ single-project view",
  "  node scan-memory.ts [project] --audit    findings only, no writes  (+ --json to emit the blob to stdout)",
  "  node scan-memory.ts [project] --reindex  regenerate MEMORY.md canonically (writes; snapshots first)",
  "  node scan-memory.ts [project] --validate re-check integrity (nonzero exit on regression)",
  "  node scan-memory.ts [project] --snapshot back up the memory dir to .curator-backups/<ts>/",
  "  node scan-memory.ts [project] --undo <ts> restore a snapshot",
  "",
  "[project] = a name, encoded slug, cwd path, or memory-dir path; omit to resolve from the git root.",
  "Options: --out <f> --findings <f> --open --no-redact --severity low|med|high|critical --json --backup-dir <d>",
].join("\n");

const main = (): void => {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === "help") {
    console.error(USAGE);
    return;
  }

  // ── cross-project view-only sweep ────────────────────────────────────
  if (args.mode === "all") {
    const projects = listProjectsWithMemory();
    if (projects.length === 0) {
      console.error("No project on this machine has a memory dir under ~/.claude/projects/*/memory/.");
      process.exit(0);
    }
    console.error(`Scanning ${projects.length} project(s) with memory…`);
    const avs = projects.map((p) => scan(p.slug, args.redact));
    const html = renderAllReport(avs);
    const out = args.out ?? join(process.cwd(), "mem-all.html");
    writeFileSync(out, html, "utf8");
    console.error(`\nCross-project report: ${out}  (${projects.length} projects)`);
    warnSecrets(args.redact);
    if (args.open) openInBrowser(out);
    console.log(out);
    return;
  }

  const target = resolveTarget(args.project);

  // ── undo: restore a snapshot ─────────────────────────────────────────
  if (args.mode === "undo") {
    if (!args.undoTs) {
      console.error("Usage: --undo <ts>   (timestamp dir under <memoryDir>/.curator-backups/)");
      process.exit(1);
    }
    const backup = args.backupDir ?? join(target.memoryDir, ".curator-backups", args.undoTs);
    if (!existsSync(backup)) {
      console.error(`No backup at ${backup}`);
      process.exit(1);
    }
    const n = copyTree(backup, target.memoryDir);
    console.error(`Restored ${n} file(s) from ${backup} → ${target.memoryDir}`);
    console.log(target.memoryDir);
    return;
  }

  // ── snapshot: explicit backup before model-driven edits ──────────────
  if (args.mode === "snapshot") {
    if (!target.exists) {
      console.error(`No memory dir to snapshot at ${target.memoryDir}`);
      process.exit(1);
    }
    const dest = snapshot(target.memoryDir, args.backupDir);
    console.error(`Snapshot → ${dest}`);
    console.log(dest);
    return;
  }

  // ── validate: re-check integrity, nonzero on regression ──────────────
  if (args.mode === "validate") {
    const vault = parseVault(target);
    const graph = buildGraph(vault);
    const { ok, regressions } = validateVault(vault, graph);
    if (!ok) {
      console.error(`Integrity check FAILED — ${regressions.length} regression(s):`);
      for (const r of regressions) console.error(`  ${r.check} ${r.file ?? ""} — ${r.message}`);
      process.exitCode = 1;
    } else {
      console.error("Integrity OK — no broken links, dangling entries, orphans, or budget overflow.");
    }
    console.log(target.memoryDir);
    return;
  }

  // ── reindex: regenerate MEMORY.md canonically (WRITES) ───────────────
  if (args.mode === "reindex") {
    const vault = parseVault(target);
    const { content, blocked, reason } = buildCanonicalIndex(vault);
    if (blocked) {
      console.error(`--reindex blocked: ${reason}`);
      process.exit(1);
    }
    const dest = snapshot(target.memoryDir, args.backupDir);
    console.error(`Backed up to ${dest}`);
    const memPath = join(target.memoryDir, "MEMORY.md");
    writeFileSync(memPath, content, "utf8");
    console.error(`Regenerated ${memPath}${reason ? `  (note: ${reason})` : ""}`);
    console.log(memPath);
    return;
  }

  // ── view / audit ─────────────────────────────────────────────────────
  const av = scan(args.project, args.redact);
  if (args.severity !== "low") av.findings = filterSeverity(av.findings, args.severity);

  // Dead-end notice (cwd here, agent-skills, is the empty case).
  if (av.state !== "ok") {
    const others = av.otherProjects.map((p) => `${p.project} (${p.fileCount})`).join(", ");
    console.error(
      `Memory for "${av.project}" is ${av.state} (${av.memoryDir}). Nothing to curate here.` +
        (others ? `\nProjects with memory: ${others}` : ""),
    );
  }

  const slugLabel = basename(av.project) || av.slug;
  const html = renderReport(av);
  const htmlOut = args.out ?? join(process.cwd(), `mem-${slugLabel}.html`);
  writeFileSync(htmlOut, html, "utf8");

  const bySev = (["critical", "high", "med", "low"] as Severity[])
    .map((s) => `${av.severityCounts[s] ?? 0} ${s}`)
    .join(" · ");
  console.error(
    `\nMemory report: ${htmlOut}\n` +
      `  ${av.files.length} memories · ${av.findings.length} findings (${bySev}) · ${av.candidates.length} candidate set(s)`,
  );
  warnSecrets(args.redact);

  if (args.mode === "audit") {
    const json = serializeFindings(av);
    if (args.json) {
      console.error(`HTML: ${htmlOut}`);
      console.log(json); // stdout = the JSON blob itself (pipe to the model)
    } else {
      const fOut = args.findings ?? join(process.cwd(), `mem-${slugLabel}.findings.json`);
      writeFileSync(fOut, json, "utf8");
      console.error(`Findings JSON: ${fOut}`);
      console.error(`HTML: ${htmlOut}`);
      console.log(fOut); // stdout = the model's next input path
    }
  } else {
    console.log(htmlOut); // view mode: stdout = the HTML path
  }

  if (args.open) openInBrowser(htmlOut);
};

main();
