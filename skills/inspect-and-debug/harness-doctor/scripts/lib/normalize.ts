/**
 * Command-family normalisation and error-signature clustering.
 *
 * Normalising is the hinge of the audit: `bun run typecheck --filter web` and
 * `bun run typecheck --filter api` must land in one family so their cost sums,
 * while `bun test` must stay separate. The rule is: keep the binary, the
 * subcommand, and the script name; drop paths, numbers, hashes, quoted strings,
 * and flag values.
 */
import type { NormalizedCommand } from "./types.ts";

/** Segments that set up a shell but do no work, so never name a family. */
const SETUP_BINS = new Set([
  "cd", "pushd", "popd", "set", "export", "unset", "source", ".", "alias",
  "shopt", "umask", "trap", "true", "exec",
]);

/** Wrappers that stand in front of the real command. */
const UNARY_WRAPPERS = new Set(["sudo", "command", "time", "nohup", "env", "npx", "bunx", "pnpx", "stdbuf"]);

/** Two-word wrappers: `<bin> <word>` runs the next word as the real command. */
const BINARY_WRAPPERS: Record<string, Set<string>> = {
  pnpm: new Set(["dlx", "exec"]),
  yarn: new Set(["dlx"]),
  npm: new Set(["exec", "x"]),
  bun: new Set(["x"]),
};

/** Binaries whose first path argument is a script worth keeping in the family. */
const SCRIPT_RUNNERS = new Set([
  "node", "bun", "deno", "python", "python3", "py", "tsx", "ts-node", "sh",
  "bash", "zsh", "fish", "ruby", "perl", "php", "uv", "uvx", "poetry",
]);

/** Words after which the next bare word is the script or task name. */
const RUN_WORDS = new Set(["run", "run-script", "exec", "test", "dlx", "x", "workspace", "task"]);

/** Max family words kept after the binary. */
const FAMILY_BUDGET = 3;

/** One shell word, with whether it arrived quoted or substituted. */
interface Word {
  text: string;
  quoted: boolean;
}

/** Replace heredoc bodies with a marker so their contents never reach a family. */
const stripHeredocs = (cmd: string) =>
  cmd.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, "<<HEREDOC");

/**
 * Split a command into top-level segments on `&&`, `||`, `;`, a pipe, or a
 * newline, ignoring separators inside quotes, `$(...)`, backticks, or `(...)`.
 * Reports whether the command ends in a background `&`.
 */
const splitSegments = (cmd: string) => {
  const segments: string[] = [];
  let buf = "";
  let single = false;
  let double = false;
  let backtick = false;
  let depth = 0;
  let background = false;
  const push = () => {
    if (buf.trim()) segments.push(buf.trim());
    buf = "";
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]!;
    const next = cmd[i + 1];
    const prev = cmd[i - 1];
    if (c === "\\" && !single) {
      buf += c + (next ?? "");
      i++;
      continue;
    }
    if (c === "'" && !double && !backtick) {
      single = !single;
      buf += c;
      continue;
    }
    if (c === '"' && !single) {
      double = !double;
      buf += c;
      continue;
    }
    if (single || double) {
      buf += c;
      continue;
    }
    if (c === "`") {
      backtick = !backtick;
      buf += c;
      continue;
    }
    if (c === "(") {
      depth++;
      buf += c;
      continue;
    }
    if (c === ")") {
      depth = Math.max(0, depth - 1);
      buf += c;
      continue;
    }
    if (depth > 0 || backtick) {
      buf += c;
      continue;
    }
    if ((c === "&" && next === "&") || (c === "|" && next === "|")) {
      push();
      i++;
      continue;
    }
    if (c === "|" || c === ";" || c === "\n") {
      push();
      continue;
    }
    if (c === "&" && prev !== ">" && next !== ">") {
      background = true;
      push();
      continue;
    }
    buf += c;
  }
  push();
  return { segments, background };
};

/** Split one segment into quote-aware words, keeping `$(...)` as a single word. */
const tokenize = (segment: string) => {
  const words: Word[] = [];
  let buf = "";
  let quoted = false;
  let single = false;
  let double = false;
  let depth = 0;
  const push = () => {
    if (buf) words.push({ text: buf, quoted });
    buf = "";
    quoted = false;
  };
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i]!;
    if (c === "\\") {
      buf += segment[i + 1] ?? "";
      i++;
      continue;
    }
    if (c === "'" && !double) {
      single = !single;
      quoted = true;
      continue;
    }
    if (c === '"' && !single) {
      double = !double;
      quoted = true;
      continue;
    }
    if (!single && !double) {
      if (c === "(" || (c === "$" && segment[i + 1] === "(")) depth++;
      if (c === ")") depth = Math.max(0, depth - 1);
      if (/\s/.test(c) && depth === 0) {
        push();
        continue;
      }
    }
    buf += c;
  }
  push();
  return words;
};

/** True when the word is a flag such as `-v`, `--filter`, or `--filter=web`. */
const isFlag = (w: string) => /^-{1,2}[^-\s]/.test(w) || w === "--";

/** Leading redirection operator, e.g. `>`, `>>`, `2>`, `&>`, `<`, `2>&1`. */
const REDIRECT = /^(?:\d?(?:>>|>|<<<|<<|<)|&>>?)/;

/** True when the word is `FOO=bar`, an env assignment in front of the command. */
const isEnvAssign = (w: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w);

/** True when the word names a file or directory rather than a keyword. */
const isPathLike = (w: string) =>
  w.includes("/") || w.includes("\\") || w.startsWith("~") || w.startsWith(".") || /\.[A-Za-z0-9]{1,6}$/.test(w);

/** True when the word is a number, a hash, a UUID, or a URL. */
const isLiteral = (w: string) =>
  /^\d+([.,:]\d+)*$/.test(w) ||
  /^[0-9a-f]{7,}$/i.test(w) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(w) ||
  /^[a-z][a-z0-9+.-]*:\/\//i.test(w) ||
  /^\$/.test(w) ||
  w.startsWith("<<");

/** Strip a directory prefix and a `.exe` suffix from a binary name. */
const binName = (w: string) => {
  const base = w.split(/[\\/]/).pop() ?? w;
  return base.replace(/\.exe$/i, "");
};

/** Pick the first segment that does real work, falling back to the first one. */
const meaningfulSegment = (segments: string[]) => {
  for (const s of segments) {
    const words = tokenize(s).filter((w) => !isEnvAssign(w.text));
    const first = words[0];
    if (!first) continue;
    if (SETUP_BINS.has(binName(first.text))) continue;
    return s;
  }
  return segments[0] ?? "";
};

/** Drop leading env assignments and wrapper binaries, returning the real words. */
const unwrap = (words: Word[]) => {
  let ws = words;
  while (ws.length > 0 && isEnvAssign(ws[0]!.text)) ws = ws.slice(1);
  for (let guard = 0; guard < 4 && ws.length > 0; guard++) {
    const head = binName(ws[0]!.text);
    if (UNARY_WRAPPERS.has(head)) {
      ws = ws.slice(1);
      while (ws.length > 0 && (isEnvAssign(ws[0]!.text) || isFlag(ws[0]!.text))) ws = ws.slice(1);
      continue;
    }
    const second = ws[1] ? binName(ws[1]!.text) : "";
    if (BINARY_WRAPPERS[head]?.has(second)) {
      ws = ws.slice(2);
      continue;
    }
    break;
  }
  return ws;
};

/**
 * Reduce a shell command to its family, base binary, distinctness key, and
 * chain length. Safe on any input: an unparseable command yields the raw first
 * word as both bin and family.
 */
export const normalizeCommand = (raw: string): NormalizedCommand => {
  const cmd = stripHeredocs(raw ?? "");
  const { segments, background } = splitSegments(cmd);
  const primary = meaningfulSegment(segments);
  const words = unwrap(tokenize(primary));
  const bin = words.length > 0 ? binName(words[0]!.text) : "";

  const kept: string[] = [];
  let sawScript = false;
  let sawOperand = false;
  let pendingFlagValue = false;
  let pendingRedirectTarget = false;
  for (let i = 1; i < words.length && kept.length < FAMILY_BUDGET; i++) {
    const w = words[i]!;
    const text = w.text;
    const redirect = REDIRECT.exec(text);
    if (redirect) {
      // `2>&1` carries its own target; a bare `>` swallows the next word.
      pendingRedirectTarget = redirect[0].length === text.length;
      pendingFlagValue = false;
      continue;
    }
    if (pendingRedirectTarget) {
      pendingRedirectTarget = false;
      continue;
    }
    if (isFlag(text)) {
      pendingFlagValue = !text.includes("=") && text !== "--";
      continue;
    }
    // Bare `-` and `--` mean stdin or end-of-flags: never part of a family.
    if (text === "-" || text === "--") continue;
    const scriptSlot = SCRIPT_RUNNERS.has(bin) || (kept.length > 0 && RUN_WORDS.has(kept[kept.length - 1]!));
    if (isPathLike(text) && !w.quoted) {
      // A script path names the work; any other path is just an argument.
      if (scriptSlot && !sawScript) {
        const base = (text.split(/[\\/]/).pop() ?? text).replace(/\.[A-Za-z0-9]{1,6}$/, "");
        if (base && !isLiteral(base)) {
          kept.push(base);
          sawScript = true;
        }
      }
      sawOperand = true;
      pendingFlagValue = false;
      continue;
    }
    if (pendingFlagValue) {
      pendingFlagValue = false;
      continue;
    }
    if (w.quoted || isLiteral(text) || isEnvAssign(text)) {
      // A pattern or a literal ends the subcommand run: what follows is operands.
      sawOperand = true;
      continue;
    }
    if (sawOperand) continue;
    kept.push(text);
    if (scriptSlot) sawScript = true;
  }

  const family = [bin, ...kept].filter(Boolean).join(" ") || raw.trim().split(/\s+/)[0] || "";
  return {
    family,
    bin,
    normalized: normalizeCommandText(cmd, segments),
    chainLength: segments.length,
    background,
  };
};

/**
 * Mask the varying literals in a command while keeping flags and bare words, so
 * two attempts that differ only in a path, a number, or a quoted string compare
 * equal. This is the distinctness key for flag flailing and retry loops.
 */
export const normalizeCommandText = (raw: string, presplit?: string[]) => {
  const segments = presplit ?? splitSegments(stripHeredocs(raw ?? "")).segments;
  const out = segments.map((segment) =>
    tokenize(segment)
      .map(({ text, quoted }) => {
        if (quoted) return "<str>";
        if (isEnvAssign(text)) return `${text.split("=")[0]}=<v>`;
        if (/^-{1,2}[^-\s]+=/.test(text)) return `${text.split("=")[0]}=<v>`;
        if (isFlag(text)) return text;
        if (isLiteral(text)) return "<lit>";
        if (isPathLike(text)) return "<path>";
        return text;
      })
      .join(" "),
  );
  return out.join(" ; ").slice(0, 400);
};

/** Base binary of a command, with wrappers and paths stripped: `bun`, `git`, `rg`. */
export const baseBinary = (raw: string) => normalizeCommand(raw).bin;

/** Normalised command family of a command: `bun run typecheck`, `git log`. */
export const commandFamily = (raw: string) => normalizeCommand(raw).family;

/**
 * Cluster key for an error message: URLs, paths, quoted strings, UUIDs, hashes,
 * and numbers masked, whitespace collapsed, capped at 200 chars. Two failures of
 * the same shape produce the same signature.
 */
export const errorSignature = (msg: string) => {
  if (!msg) return "";
  const head = msg.split("\n").filter((l) => l.trim()).slice(0, 2).join(" ");
  return head
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "<url>")
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "<str>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/(?:[A-Za-z]:)?(?:[\w.@~+-]*[\\/])+[\w.@+-]*/g, "<path>")
    .replace(/\b[0-9a-f]{7,}\b/gi, "<hash>")
    .replace(/\b\d+(?:[.,]\d+)*\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
};
