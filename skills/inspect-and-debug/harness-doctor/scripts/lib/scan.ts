/**
 * Walk the transcripts root and turn every transcript in the window into the
 * five fact tables.
 *
 * Two things the tree teaches you: transcripts nest, and most of them are
 * nested. A one-level glob finds only the main sessions, which was ~10% of the
 * reference corpus (386 of 3,101): the rest sit under
 * `<sid>/subagents/.../agent-<id>.jsonl`. So the walk is recursive, and it skips
 * `journal.jsonl` and `*.meta.json`.
 *
 * Memory: one file is read, converted to rows, and released before the next one
 * opens. Nothing holds the raw corpus.
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import type {
  AuditOptions,
  BashRow,
  ErrorRow,
  FactTables,
  ScanResult,
  SessionKind,
  SessionRow,
  ToolRow,
  UserMsgRow,
} from "./types.ts";
import { normalizeCommand, errorSignature } from "./normalize.ts";
import { redactIf } from "./redact.ts";

/** A transcript file located on disk, before it is parsed. */
interface TranscriptRef {
  file: string;
  proj: string;
  sid: string;
  kind: SessionKind;
  parent?: string;
  run?: string;
}

/** Rows produced by one transcript. */
interface FileRows {
  session: SessionRow;
  tools: ToolRow[];
  bash: BashRow[];
  userMsgs: UserMsgRow[];
  errors: ErrorRow[];
}

const MAX_TEXT = 4000;
const MAX_ERR = 600;
const MAX_OUT_OK = 200;
const MAX_OUT_ERR = 600;
const MAX_ARG = 500;

/** Harness-generated wrappers that are not human input. */
const HARNESS_BLOCKS = [
  /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  /<task-notification>[\s\S]*?<\/task-notification>/g,
  /<command-name>[\s\S]*?<\/command-name>/g,
  /<command-message>[\s\S]*?<\/command-message>/g,
  /<command-args>[\s\S]*?<\/command-args>/g,
  /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g,
  /<local-command-stderr>[\s\S]*?<\/local-command-stderr>/g,
];

/** Openers that mark a turn as machine-generated even when unclosed. */
const HARNESS_PREFIX =
  /^(?:\[Request interrupted|<system-reminder|<task-notification|<command-name|<command-message|<command-args|<local-command|Caveat: The messages below|API Error|\[Tool result)/;

/** ISO timestamp to epoch seconds, or undefined when absent or unparseable. */
const epoch = (ts: unknown) => {
  if (typeof ts !== "string") return undefined;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
};

/** ISO timestamp to epoch seconds with millisecond precision, for durations. */
const epochMs = (ts: unknown) => {
  if (typeof ts !== "string") return undefined;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : undefined;
};

/** Anything to a string: strings pass through, objects are JSON. */
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));

/** Flatten a tool_result `content` field: a string, or text blocks in an array. */
const resultText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as Record<string, unknown>;
        if (block?.type === "text") return str(block.text);
        if (block?.type === "image") return "";
        return "";
      })
      .join("\n");
  }
  return content == null ? "" : str(content);
};

/** The tool-specific argument that identifies what a call touched. */
const primaryArg = (tool: string, input: Record<string, unknown>) => {
  const pick = (...keys: string[]) => {
    for (const k of keys) if (typeof input[k] === "string" && input[k]) return input[k] as string;
    return undefined;
  };
  switch (tool) {
    case "Read":
    case "Edit":
    case "Write":
    case "MultiEdit":
    case "NotebookEdit":
      return pick("file_path", "notebook_path", "path");
    case "Grep":
    case "Glob":
      return pick("pattern");
    case "WebFetch":
      return pick("url");
    case "WebSearch":
      return pick("query");
    case "Agent":
    case "Task":
      return pick("subagent_type", "description");
    case "Skill":
      return pick("skill", "command");
    default:
      return undefined;
  }
};

/** Cut a string to `n` chars. */
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/**
 * Classify a transcript by where it sits under the project dir: depth 1 is a
 * main session, a `subagents/workflows/wf_<id>` ancestor makes it a workflow
 * agent, anything else nested is a plain subagent.
 */
const classify = (parts: string[]): Pick<TranscriptRef, "kind" | "parent" | "run"> => {
  if (parts.length <= 1) return { kind: "main" };
  const parent = parts[0];
  const wfIndex = parts.findIndex((p) => p.startsWith("wf_"));
  if (wfIndex > 0 && parts[wfIndex - 1] === "workflows") {
    return { kind: "workflow-agent", parent, run: parts[wfIndex] };
  }
  return { kind: "subagent", parent };
};

/**
 * List every transcript under the root, recursively, sorted by path so two runs
 * see the same order. `projects` filters project dirs by substring.
 */
export const listTranscripts = (root: string, projects: string[] = []) => {
  const found: TranscriptRef[] = [];
  let projectDirs: string[] = [];
  try {
    projectDirs = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return found;
  }
  for (const proj of projectDirs) {
    if (projects.length > 0 && !projects.some((p) => proj.includes(p))) continue;
    const projRoot = join(root, proj);
    const walk = (dir: string, parts: string[]) => {
      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), [...parts, entry.name]);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
        if (entry.name === "journal.jsonl") continue;
        found.push({
          file: join(dir, entry.name),
          proj,
          sid: entry.name.slice(0, -".jsonl".length),
          ...classify([...parts, entry.name]),
        });
      }
    };
    walk(projRoot, []);
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
};

/** Strip harness-generated blocks so a correction scan sees only human words. */
const stripHarness = (text: string) => {
  let out = text;
  for (const re of HARNESS_BLOCKS) out = out.replace(re, " ");
  return out.trim();
};

/** One in-flight tool call, waiting for its result. */
interface PendingCall {
  tool: string;
  input: Record<string, unknown>;
  tMs?: number;
  side: boolean;
}

/**
 * Parse one transcript file into fact rows. Malformed lines are skipped
 * silently: a live session's last line is often half-written.
 */
export const parseTranscript = (ref: TranscriptRef, bytes: number, options: AuditOptions): FileRows => {
  const { redact } = options;
  const tools: ToolRow[] = [];
  const bash: BashRow[] = [];
  const userMsgs: UserMsgRow[] = [];
  const errors: ErrorRow[] = [];

  const pending = new Map<string, PendingCall>();
  const seenResults = new Set<string>();
  const seenTurns = new Set<string>();
  const models: Record<string, number> = {};
  const toolCounts: Record<string, number> = {};

  const session: SessionRow = {
    sid: ref.sid,
    proj: ref.proj,
    file: ref.file,
    bytes,
    kind: ref.kind,
    parent: ref.parent,
    run: ref.run,
    assistantMsgs: 0,
    userMsgs: 0,
    inTokens: 0,
    outTokens: 0,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    maxCtx: 0,
    firstTurnCacheCreate: 0,
    models,
    tools: toolCounts,
    interrupts: 0,
    errors: 0,
  };
  let firstTurnSeen = false;

  let raw = "";
  try {
    raw = readFileSync(ref.file, "utf8");
  } catch {
    return { session, tools, bash, userMsgs, errors };
  }

  /** Record one user turn, flagging whether a human really typed it. */
  const pushUserMsg = (textRaw: string, ctx: { t?: number; side: boolean; isMeta: boolean }) => {
    if (textRaw.includes("[Request interrupted")) session.interrupts++;
    const stripped = stripHarness(textRaw);
    const body = stripped || textRaw.trim();
    const human =
      ref.kind === "main" && !ctx.side && !ctx.isMeta && stripped.length > 0 && !HARNESS_PREFIX.test(stripped);
    userMsgs.push({
      sid: ref.sid,
      proj: ref.proj,
      kind: ref.kind,
      t: ctx.t,
      text: redactIf(redact, clip(body, MAX_TEXT)),
      side: ctx.side,
      human,
    });
  };

  /** Record one tool call: a ToolRow always, plus a BashRow and an ErrorRow when due. */
  const emitCall = (c: {
    tool: string;
    input: Record<string, unknown>;
    t?: number;
    durSec?: number;
    err: boolean;
    text: string;
    side: boolean;
  }) => {
    const outChars = c.text.length;
    const arg = primaryArg(c.tool, c.input);
    tools.push({
      sid: ref.sid,
      proj: ref.proj,
      kind: ref.kind,
      t: c.t,
      tool: c.tool,
      durSec: c.durSec,
      err: c.err,
      outChars,
      arg: arg ? clip(arg, MAX_ARG) : undefined,
      side: c.side,
    });
    if (c.tool === "Bash") {
      const cmd = str(c.input.command ?? c.input.cmd ?? "");
      const n = normalizeCommand(cmd);
      bash.push({
        sid: ref.sid,
        proj: ref.proj,
        kind: ref.kind,
        t: c.t,
        durSec: c.durSec,
        err: c.err,
        outChars,
        cmd: redactIf(redact, cmd),
        desc: typeof c.input.description === "string" ? c.input.description : undefined,
        family: n.family,
        bin: n.bin,
        bg: c.input.run_in_background === true || n.background,
        out: redactIf(redact, clip(c.text, c.err ? MAX_OUT_ERR : MAX_OUT_OK)),
        side: c.side,
      });
    }
    if (!c.err) return;
    const msgText = redactIf(redact, clip(c.text, MAX_ERR));
    errors.push({
      sid: ref.sid,
      proj: ref.proj,
      kind: ref.kind,
      t: c.t,
      tool: c.tool,
      input: redactIf(redact, clip(JSON.stringify(c.input), MAX_ERR)),
      msg: msgText,
      sig: errorSignature(msgText),
    });
  };

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = String(o.type ?? "");
    const t = epoch(o.timestamp);
    const tMs = epochMs(o.timestamp);
    if (t !== undefined) {
      if (session.start === undefined) session.start = t;
      session.end = t;
    }
    if (typeof o.cwd === "string" && !session.cwd) session.cwd = o.cwd;
    if (typeof o.gitBranch === "string" && o.gitBranch) session.branch = o.gitBranch;
    if (typeof o.version === "string") session.ver = o.version;
    const side = o.isSidechain === true;
    const msg = (o.message ?? {}) as Record<string, unknown>;

    if (type === "assistant") {
      session.assistantMsgs++;
      const model = String(msg.model ?? "unknown");
      const usage = (msg.usage ?? {}) as Record<string, number>;
      const turnKey = String(o.requestId ?? msg.id ?? `line-${session.assistantMsgs}`);
      if (!seenTurns.has(turnKey) && msg.usage) {
        seenTurns.add(turnKey);
        const inTok = usage.input_tokens ?? 0;
        const outTok = usage.output_tokens ?? 0;
        const cr = usage.cache_read_input_tokens ?? 0;
        const cc = usage.cache_creation_input_tokens ?? 0;
        session.inTokens += inTok;
        session.outTokens += outTok;
        session.cacheReadTokens += cr;
        session.cacheCreateTokens += cc;
        session.maxCtx = Math.max(session.maxCtx, inTok + cr + cc);
        models[model] = (models[model] ?? 0) + 1;
        if (!firstTurnSeen) {
          session.firstTurnCacheCreate = cc;
          firstTurnSeen = true;
        }
      }
      for (const b of (msg.content ?? []) as Array<Record<string, unknown>>) {
        if (b?.type !== "tool_use") continue;
        const tool = String(b.name ?? "tool");
        const id = typeof b.id === "string" ? b.id : "";
        const input = (b.input ?? {}) as Record<string, unknown>;
        toolCounts[tool] = (toolCounts[tool] ?? 0) + 1;
        if (id) pending.set(id, { tool, input, tMs, side });
      }
      continue;
    }

    if (type !== "user") continue;
    session.userMsgs++;
    const tur = (o.toolUseResult ?? {}) as Record<string, unknown>;
    if (tur?.interrupted === true) session.interrupts++;
    const content = msg.content;

    if (typeof content === "string") {
      pushUserMsg(content, { t, side, isMeta: o.isMeta === true });
      continue;
    }
    if (!Array.isArray(content)) continue;

    for (const b of content as Array<Record<string, unknown>>) {
      if (b?.type === "text") {
        pushUserMsg(str(b.text), { t, side, isMeta: o.isMeta === true });
        continue;
      }
      if (b?.type !== "tool_result") continue;
      const id = typeof b.tool_use_id === "string" ? b.tool_use_id : "";
      if (id && seenResults.has(id)) continue;
      if (id) seenResults.add(id);
      const call = id ? pending.get(id) : undefined;
      if (id) pending.delete(id);
      let text = resultText(b.content);
      if (!text && (typeof tur.stdout === "string" || typeof tur.stderr === "string")) {
        text = `${str(tur.stdout)}${str(tur.stderr)}`;
      }
      if (text.includes("[Request interrupted")) session.interrupts++;
      const err = b.is_error === true;
      if (err) session.errors++;
      const tool = call?.tool ?? "unknown";
      const input = call?.input ?? {};
      const callT = call?.tMs !== undefined ? Math.floor(call.tMs / 1000) : t;
      const durSec =
        call?.tMs !== undefined && tMs !== undefined
          ? Math.max(0, Math.round(((tMs - call.tMs) / 1000) * 1000) / 1000)
          : undefined;
      emitCall({ tool, input, t: callT, durSec, err, text, side: call?.side ?? side });
    }
  }

  // Tool calls whose result never arrived: the session ended or was interrupted.
  for (const [, call] of pending) {
    emitCall({
      tool: call.tool,
      input: call.input,
      t: call.tMs !== undefined ? Math.floor(call.tMs / 1000) : undefined,
      durSec: undefined,
      err: false,
      text: "",
      side: call.side,
    });
  }

  return { session, tools, bash, userMsgs, errors };
};

/**
 * Scan every transcript in the window and return the fact tables plus counts.
 * Progress goes to stderr so stdout stays a clean summary.
 */
export const scanTranscripts = (options: AuditOptions): ScanResult => {
  const toEpoch = Math.floor(Date.now() / 1000);
  const fromEpoch = toEpoch - options.days * 86400;
  const refs = listTranscripts(options.root, options.projects);
  const tables: FactTables = { sessions: [], tools: [], bash: [], userMsgs: [], errors: [] };
  const seenProjects = new Set<string>();
  let scanned = 0;
  let skipped = 0;

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]!;
    let bytes = 0;
    let mtime = 0;
    try {
      const st = statSync(ref.file);
      bytes = st.size;
      mtime = Math.floor(st.mtimeMs / 1000);
    } catch {
      skipped++;
      continue;
    }
    // A file untouched since before the window cannot hold activity inside it.
    if (mtime < fromEpoch) {
      skipped++;
      continue;
    }
    const rows = parseTranscript(ref, bytes, options);
    const end = rows.session.end ?? mtime;
    if (end < fromEpoch) {
      skipped++;
      continue;
    }
    scanned++;
    seenProjects.add(ref.proj);
    tables.sessions.push(rows.session);
    tables.tools.push(...rows.tools);
    tables.bash.push(...rows.bash);
    tables.userMsgs.push(...rows.userMsgs);
    tables.errors.push(...rows.errors);
    if (scanned % 200 === 0 || i === refs.length - 1) {
      process.stderr.write(
        `scanned ${scanned}/${refs.length} files, ${tables.tools.length} tool calls, ${tables.bash.length} bash\n`,
      );
    }
  }
  process.stderr.write(`scan done: ${scanned} transcripts, ${skipped} skipped, ${seenProjects.size} projects\n`);

  return {
    tables,
    filesScanned: scanned,
    filesSkipped: skipped,
    projectCount: seenProjects.size,
    fromEpoch,
    toEpoch,
  };
};

/** File name each table lands in, in the order they are written. */
const TABLE_FILES: Array<[keyof FactTables, string]> = [
  ["sessions", "sessions.jsonl"],
  ["tools", "tools.jsonl"],
  ["bash", "bash.jsonl"],
  ["userMsgs", "user-msgs.jsonl"],
  ["errors", "errors.jsonl"],
];

/**
 * Write the five JSONL fact tables into `outDir`, creating it if needed.
 * Returns the paths written. Rows go out in scan order, so two runs over the
 * same transcripts produce byte-identical files.
 */
export const writeTables = (tables: FactTables, outDir: string) => {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const [key, name] of TABLE_FILES) {
    const path = join(outDir, name);
    writeFileSync(path, "", "utf8");
    const rows: unknown[] = tables[key];
    let chunk = "";
    for (const row of rows) {
      chunk += `${JSON.stringify(row)}\n`;
      if (chunk.length > 4_000_000) {
        appendFileSync(path, chunk, "utf8");
        chunk = "";
      }
    }
    if (chunk) appendFileSync(path, chunk, "utf8");
    written.push(path);
  }
  return written;
};
