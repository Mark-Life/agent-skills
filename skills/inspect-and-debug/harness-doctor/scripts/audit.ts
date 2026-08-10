#!/usr/bin/env -S node --experimental-strip-types
/**
 * harness-doctor: mine the last N days of agent transcripts for wasted
 * wall-clock, wasted tokens, and repeated human corrections.
 *
 * Runtime: zero build step, zero dependencies. Runs on Node >=22.18 (native TS
 * type-stripping) or Bun. On older Node use `npx tsx audit.ts ...`.
 *
 * Usage:
 *   node audit.ts [options]
 *   bun run audit.ts [options]
 *
 * Options:
 *   --days <n>          window in days, default 30
 *   --root <path>       transcripts root, default <home>/.claude/projects
 *   --out <dir>         work dir for fact tables, default <tmpdir>/harness-audit
 *   --project <substr>  only project dirs containing this substring (repeatable)
 *   --format md|json    stdout summary format, default md
 *   --top <n>           rows per ranking, default 15
 *   --no-tables         compute aggregates without writing the fact tables
 *   --no-redact         disable secret redaction of text fields (ON by default)
 *   --pricing <file>    JSON overriding the built-in per-model price table
 *
 * The summary goes to stdout, progress to stderr, and in `md` mode the last
 * stdout line is the work dir path unless `--no-tables` wrote nothing there.
 * The fact tables contain real prompts and command output: treat the work dir
 * as sensitive.
 */
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { scanTranscripts, writeTables } from "./lib/scan.ts";
import { aggregate } from "./lib/aggregate.ts";
import { renderMarkdown } from "./lib/render.ts";
import type { AggregateOptions, AuditOptions, PriceTable } from "./lib/types.ts";

const USAGE =
  "Usage: node audit.ts [--days n] [--root path] [--out dir] [--project substr]... " +
  "[--format md|json] [--top n] [--no-tables] [--no-redact] [--pricing file]";

/** Read a price-table override, exiting with a clear message when it is unusable. */
const loadPricing = (path: string): PriceTable => {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as PriceTable;
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    return parsed;
  } catch (err) {
    console.error(`Cannot read --pricing ${path}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
};

/** Parse argv into fully resolved options. Unknown flags are a hard error. */
export const parseArgs = (argv: string[]): AuditOptions => {
  const o: AuditOptions = {
    days: 30,
    root: join(homedir(), ".claude", "projects"),
    out: join(tmpdir(), "harness-audit"),
    projects: [],
    format: "md",
    top: 15,
    writeTables: true,
    redact: true,
  };
  const num = (raw: string | undefined, flag: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      console.error(`${flag} needs a positive number, got ${String(raw)}`);
      process.exit(1);
    }
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--days") o.days = num(argv[++i], "--days");
    else if (a === "--root") o.root = argv[++i] ?? o.root;
    else if (a === "--out") o.out = argv[++i] ?? o.out;
    else if (a === "--project") {
      const v = argv[++i];
      if (v) o.projects.push(v);
    } else if (a === "--format") {
      const v = argv[++i];
      if (v !== "md" && v !== "json") {
        console.error(`--format must be md or json, got ${String(v)}`);
        process.exit(1);
      }
      o.format = v;
    } else if (a === "--top") o.top = num(argv[++i], "--top");
    else if (a === "--no-tables") o.writeTables = false;
    else if (a === "--no-redact") o.redact = false;
    else if (a === "--pricing") {
      const v = argv[++i];
      if (!v) {
        console.error("--pricing needs a file path");
        process.exit(1);
      }
      o.pricingPath = v;
      o.pricing = loadPricing(v);
    } else if (a === "-h" || a === "--help") {
      console.error(USAGE);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}\n${USAGE}`);
      process.exit(1);
    }
  }
  return o;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  process.stderr.write(`scanning ${options.root}, last ${options.days} days\n`);

  const scan = scanTranscripts(options);
  if (scan.filesScanned === 0) {
    console.error(
      `No transcripts in the last ${options.days} days under ${options.root}. ` +
        "Check --root, widen --days, or drop --project.",
    );
  }
  if (options.writeTables) {
    const written = writeTables(scan.tables, options.out);
    process.stderr.write(`wrote ${written.length} fact tables to ${options.out}\n`);
    process.stderr.write(
      options.redact
        ? "  the tables hold real prompts and command output, redacted best-effort: review before sharing\n"
        : "  WARNING: redaction DISABLED (--no-redact): the tables hold raw prompts and secrets\n",
    );
  }

  // The aggregation reads the fact tables; the scan counters ride along on the
  // options because only the scanner can know them.
  const aggOptions: AggregateOptions = {
    ...options,
    filesScanned: scan.filesScanned,
    filesSkipped: scan.filesSkipped,
    projectCount: scan.projectCount,
    fromEpoch: scan.fromEpoch,
    toEpoch: scan.toEpoch,
  };
  const report = aggregate(scan.tables, aggOptions);
  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderMarkdown(report, options)}\n`);
  // The work dir is only worth printing when something was written there.
  if (options.writeTables) process.stdout.write(`${options.out}\n`);
};

main();
