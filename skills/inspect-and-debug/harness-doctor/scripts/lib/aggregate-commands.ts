/**
 * The `commands` and `errors` sections of the audit.
 *
 * These two carry most of the diagnostic value: `flagFlailing` and `retryLoops`
 * are what catch an agent groping for the right invocation, so the windowing is
 * spelled out rather than approximated.
 */

import {
  bump,
  byTime,
  clip,
  cmpStr,
  collapseWs,
  groupBy,
  median,
  percentile,
  ranking,
  safeDiv,
  round,
  sum,
  topKey,
  uniqSorted,
} from "./stats.ts";
import type {
  BashRow,
  CommandFamilyRow,
  CommandsSection,
  ErrorClusterRow,
  ErrorRow,
  ErrorsSection,
  FlagFlailingRow,
  MissingBinaryRow,
  PermissionDeniedRow,
  RepeatCommandRow,
  RetryLoopRow,
} from "./types.ts";

/** Seconds a burst of same-bin commands may span and still count as one flail. */
const FLAIL_WINDOW_SEC = 600;

/** Distinct normalised commands inside one window that make it a flail. */
const FLAIL_MIN_DISTINCT = 4;

/** Seconds after a failure inside which a re-run counts as a retry. */
const RETRY_WINDOW_SEC = 300;

/** Duration of a bash call in seconds, 0 when the transcript had no result time. */
const secOf = (row: { durSec?: number }) => row.durSec ?? 0;

/** Comparable form of a command: whitespace collapsed, nothing else changed. */
const cmdKey = (cmd: string) => collapseWs(cmd);

/** Roll a set of bash rows sharing a family into one ranked row. */
const familyRow = (family: string, rows: readonly BashRow[]): CommandFamilyRow => {
  const secs = rows.map(secOf);
  const bins = new Map<string, number>();
  for (const row of rows) bump(bins, row.bin);
  return {
    family,
    bin: topKey(bins),
    count: rows.length,
    totalSec: round(sum(secs, (s) => s), 1),
    medianSec: round(median(secs), 2),
    p95Sec: round(percentile(secs, 0.95), 2),
    errRate: round(safeDiv(rows.filter((r) => r.err).length, rows.length), 4),
  };
};

/**
 * Command families ranked by seconds and by count, for a subset of bash rows.
 * Exported so the projects section can reuse the same maths per project.
 */
export const commandFamilies = (bash: readonly BashRow[]) =>
  [...groupBy(bash, (r) => r.family)]
    .map(([family, rows]) => familyRow(family, rows))
    .sort((a, b) => cmpStr(a.family, b.family));

/** Identical command re-run inside one session: everything after the first run. */
const repeatRows = (bash: readonly BashRow[], top: number) => {
  const perCmd = new Map<
    string,
    { family: string; cmd: string; occurrences: number; sessions: Set<string>; wastedSec: number }
  >();
  for (const [, rows] of groupBy(bash, (r) => `${r.sid} ${cmdKey(r.cmd)}`)) {
    if (rows.length < 2) continue;
    const ordered = [...rows].sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
    const first = ordered[0];
    if (!first) continue;
    const key = cmdKey(first.cmd);
    const entry = perCmd.get(key) ?? {
      family: first.family,
      cmd: clip(key, 200),
      occurrences: 0,
      sessions: new Set<string>(),
      wastedSec: 0,
    };
    entry.occurrences += ordered.length - 1;
    entry.sessions.add(first.sid);
    entry.wastedSec += sum(ordered.slice(1), secOf);
    perCmd.set(key, entry);
  }
  const rows: RepeatCommandRow[] = [...perCmd.values()].map((e) => ({
    family: e.family,
    cmd: e.cmd,
    occurrences: e.occurrences,
    sessions: e.sessions.size,
    wastedSec: round(e.wastedSec, 1),
  }));
  return ranking(rows, (r) => r.occurrences, (r) => r.cmd, top);
};

/** One burst of same-bin commands that all started inside the flail window. */
interface Burst {
  rows: BashRow[];
  families: Set<string>;
}

/**
 * Split time-ordered rows into bursts: a burst holds every row that starts within
 * FLAIL_WINDOW_SEC of the row that opened it, and the first row outside opens the
 * next burst. Greedy and left-to-right, so the split never depends on row order
 * beyond time.
 */
const burstsOf = (rows: readonly BashRow[]) => {
  const out: Burst[] = [];
  let current: Burst | undefined;
  let openedAt = 0;
  for (const row of rows) {
    const t = row.t ?? 0;
    if (!current || t - openedAt > FLAIL_WINDOW_SEC) {
      current = { rows: [], families: new Set<string>() };
      openedAt = t;
      out.push(current);
    }
    current.rows.push(row);
    current.families.add(row.family);
  }
  return out;
};

/**
 * Same `bin`, four or more distinct normalised commands inside ten minutes of one
 * session: the shape of an agent guessing at flags.
 */
const flailingRows = (bash: readonly BashRow[], top: number) => {
  const perBin = new Map<
    string,
    { sessions: Set<string>; occurrences: number; totalSec: number; cmds: Set<string> }
  >();
  for (const [key, rows] of groupBy(bash, (r) => `${r.sid} ${r.bin}`)) {
    const bin = key.slice(key.indexOf(" ") + 1);
    const sid = key.slice(0, key.indexOf(" "));
    for (const burst of burstsOf(byTime(rows))) {
      if (burst.families.size < FLAIL_MIN_DISTINCT) continue;
      const entry = perBin.get(bin) ?? {
        sessions: new Set<string>(),
        occurrences: 0,
        totalSec: 0,
        cmds: new Set<string>(),
      };
      entry.sessions.add(sid);
      entry.occurrences += burst.families.size;
      entry.totalSec += sum(burst.rows, secOf);
      for (const row of burst.rows) entry.cmds.add(clip(cmdKey(row.cmd), 160));
      perBin.set(bin, entry);
    }
  }
  const rows: FlagFlailingRow[] = [...perBin].map(([bin, e]) => ({
    bin,
    sessions: e.sessions.size,
    occurrences: e.occurrences,
    totalSec: round(e.totalSec, 1),
    sampleCmds: uniqSorted(e.cmds).slice(0, 4),
  }));
  return ranking(rows, (r) => r.occurrences, (r) => r.bin, top);
};

/**
 * Bash cost, ranked and diagnosed: families by seconds and by count, commands
 * re-run inside one session, and bins the agent flailed on.
 */
export const commandsSection = (
  bash: readonly BashRow[],
  top: number,
): CommandsSection => {
  const families = commandFamilies(bash);
  return {
    byTotalSec: ranking(families, (r) => r.totalSec, (r) => r.family, top),
    byCount: ranking(families, (r) => r.count, (r) => r.family, top),
    repeatsInSession: repeatRows(bash, top),
    flagFlailing: flailingRows(bash, top),
  };
};

/** Patterns that name a binary the shell could not find, most specific first. */
const MISSING_BIN_PATTERNS: readonly RegExp[] = [
  /command not found:\s*([A-Za-z0-9_.+-]+)/,
  /([A-Za-z0-9_.+-]+):\s*command not found/,
  /'([^']+)' is not recognized as an internal or external command/,
  /spawn\s+([A-Za-z0-9_.+\-/\\]+)\s+ENOENT/,
  /ENOENT[^\n]*?['"]([^'"]+)['"]/,
  /([A-Za-z0-9_.+-]+):\s*not found/,
  /No such file or directory:\s*['"]?([A-Za-z0-9_.+\-/\\]+)/,
];

/**
 * Patterns that name what a refused call was refused on, path first: an errno like
 * EACCES is the reason, not the target, so it is only used when nothing else matches.
 */
const DENIED_TARGET_PATTERNS: readonly RegExp[] = [
  /(?:EACCES|EPERM)[^\n]*?['"]([^'"]+)['"]/,
  /[Pp]ermission denied[^\n]*?['"]([^'"]+)['"]/,
  /([^\s:'"]+):\s*[Pp]ermission denied/,
];

/** Errno tokens that must never be reported as the thing a call was denied on. */
const ERRNO_TOKENS = new Set(["EACCES", "EPERM", "ENOENT", "EISDIR", "EROFS"]);

/** True when an error message is about being refused rather than about failing. */
const isDenied = (msg: string) =>
  /permission denied|EACCES|EPERM|operation not permitted|not permitted to|requires approval/i.test(
    msg,
  );

/** First capture from the first matching pattern, trimmed, skipping errno tokens. */
const firstCapture = (msg: string, patterns: readonly RegExp[]) => {
  for (const re of patterns) {
    const m = re.exec(msg);
    const hit = m?.[1]?.trim();
    if (hit && !ERRNO_TOKENS.has(hit)) return hit;
  }
  return undefined;
};

/** One error observation, whatever table it came from. */
interface Observation {
  sid: string;
  tool: string;
  msg: string;
}

/**
 * Errors and failed bash output as one list, without counting a bash failure twice:
 * a failed Bash call already appears in the errors table, so bash output is only
 * used when that table carries no Bash rows at all.
 */
const observationsOf = (errors: readonly ErrorRow[], bash: readonly BashRow[]) => {
  const rows: Observation[] = errors.map((e) => ({
    sid: e.sid,
    tool: e.tool,
    msg: e.msg,
  }));
  if (errors.some((e) => e.tool === "Bash")) return rows;
  for (const b of bash) {
    if (b.err && b.out.length > 0) rows.push({ sid: b.sid, tool: "Bash", msg: b.out });
  }
  return rows;
};

/** Group observations by an extracted target string into count/sessions/sample rows. */
const targetRows = (
  observations: readonly Observation[],
  extract: (o: Observation) => string | undefined,
) => {
  const per = new Map<string, { count: number; sessions: Set<string>; msgs: string[] }>();
  for (const obs of observations) {
    const target = extract(obs);
    if (!target) continue;
    const entry = per.get(target) ?? { count: 0, sessions: new Set<string>(), msgs: [] };
    entry.count += 1;
    entry.sessions.add(obs.sid);
    entry.msgs.push(collapseWs(obs.msg));
    per.set(target, entry);
  }
  return [...per].map(([target, e]) => ({
    target,
    count: e.count,
    sessions: e.sessions.size,
    sampleMsg: clip(shortest(e.msgs), 200),
  }));
};

/** Shortest string, ties broken alphabetically, so samples never vary between runs. */
const shortest = (values: readonly string[]) =>
  [...values].sort((a, b) => a.length - b.length || cmpStr(a, b))[0] ?? "";

/** Errors sharing a normalised signature, ranked by how often they fired. */
const clusterRows = (errors: readonly ErrorRow[], top: number) => {
  const rows: ErrorClusterRow[] = [...groupBy(errors, (e) => e.sig)].map(
    ([sig, group]) => {
      const tools = new Map<string, number>();
      for (const e of group) bump(tools, e.tool);
      return {
        sig: clip(sig, 200),
        count: group.length,
        sessionCount: new Set(group.map((e) => e.sid)).size,
        projects: uniqSorted(group.map((e) => e.proj)).slice(0, 5),
        sampleMsg: clip(shortest(group.map((e) => collapseWs(e.msg))), 240),
        topTool: topKey(tools),
      };
    },
  );
  return ranking(rows, (r) => r.count, (r) => r.sig, top);
};

/**
 * A command re-run within five minutes of failing. Chains are keyed on the exact
 * command (whitespace collapsed) so an unrelated command in between does not break
 * the chain, then reported per family.
 */
const retryRows = (bash: readonly BashRow[], top: number) => {
  const perFamily = new Map<
    string,
    { retries: number[]; sessions: Set<string>; cmds: string[] }
  >();
  for (const [, rows] of groupBy(bash, (r) => r.sid)) {
    const ordered = byTime(rows);
    const consumed = new Set<number>();
    for (let i = 0; i < ordered.length; i += 1) {
      const start = ordered[i];
      if (!start || consumed.has(i) || !start.err) continue;
      const key = cmdKey(start.cmd);
      let lastT = start.t ?? 0;
      let retries = 0;
      for (let j = i + 1; j < ordered.length; j += 1) {
        const next = ordered[j];
        if (!next) continue;
        if ((next.t ?? 0) - lastT > RETRY_WINDOW_SEC) break;
        if (consumed.has(j) || cmdKey(next.cmd) !== key) continue;
        consumed.add(j);
        retries += 1;
        lastT = next.t ?? lastT;
      }
      if (retries === 0) continue;
      const entry = perFamily.get(start.family) ?? {
        retries: [],
        sessions: new Set<string>(),
        cmds: [],
      };
      entry.retries.push(retries);
      entry.sessions.add(start.sid);
      entry.cmds.push(clip(key, 200));
      perFamily.set(start.family, entry);
    }
  }
  const rows: RetryLoopRow[] = [...perFamily].map(([family, e]) => ({
    family,
    count: e.retries.length,
    medianRetries: round(median(e.retries), 2),
    sessions: e.sessions.size,
    sampleCmd: shortest(e.cmds),
  }));
  return ranking(rows, (r) => r.count, (r) => r.family, top);
};

/**
 * What failed: signature clusters, binaries that were never on PATH, refused
 * calls, and commands the agent re-ran after they failed.
 */
export const errorsSection = (
  errors: readonly ErrorRow[],
  bash: readonly BashRow[],
  top: number,
): ErrorsSection => {
  const observations = observationsOf(errors, bash);
  const missing: MissingBinaryRow[] = targetRows(observations, (o) =>
    firstCapture(o.msg, MISSING_BIN_PATTERNS),
  ).map(({ target, ...rest }) => ({ bin: target, ...rest }));
  const denied: PermissionDeniedRow[] = targetRows(observations, (o) =>
    isDenied(o.msg) ? (firstCapture(o.msg, DENIED_TARGET_PATTERNS) ?? o.tool) : undefined,
  );
  return {
    clusters: clusterRows(errors, top),
    missingBinaries: ranking(missing, (r) => r.count, (r) => r.bin, top),
    permissionDenied: ranking(denied, (r) => r.count, (r) => r.target, top),
    retryLoops: retryRows(bash, top),
  };
};
