/**
 * Parse a Codex rollout transcript into the same ParsedSession model used for
 * Claude Code, so analyze()/render() are reused unchanged.
 *
 * Codex differs from Claude Code:
 *  - lines are {timestamp, type, payload}; content lives in response_item payloads,
 *    usage in event_msg payloads of type "token_count".
 *  - per-turn context size = last_token_usage.input_tokens. Unlike Anthropic
 *    (where input_tokens excludes cache), OpenAI/Codex input_tokens already
 *    INCLUDES cached_input_tokens as a subset, so we must NOT add it again.
 *  - model_context_window is recorded directly (declaredContextWindow).
 *  - token_count.info is null/degenerate in some sessions; turns without usable
 *    usage are skipped, so the report falls back to estimates gracefully.
 */
import { readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ParsedSession, TimelineEvent, Turn } from "./types.ts";
import { readJsonl } from "./parse.ts";
import { estTokens, firstLine } from "./tokens.ts";

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));

/** Flatten a Codex content array (input_text/output_text blocks) to text. */
const contentText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === "string" ? b : str((b as Record<string, unknown>)?.text ?? "")))
      .join("");
  }
  return "";
};

/** Resolve a Codex rollout by id (or direct path) under ~/.codex/sessions. */
export const resolveCodexSession = (idOrPath: string): { sessionId: string; path: string } => {
  if (idOrPath.endsWith(".jsonl") && existsSync(idOrPath)) {
    const m = idOrPath.match(/([0-9a-f-]{36})/i);
    return { sessionId: m?.[1] ?? idOrPath.split("/").pop()!.replace(/\.jsonl$/, ""), path: idOrPath };
  }
  const root = join(homedir(), ".codex", "sessions");
  let found: string | undefined;
  const walk = (dir: string) => {
    if (found || !existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (found) return;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.includes(idOrPath) && e.name.endsWith(".jsonl")) found = p;
    }
  };
  walk(root);
  if (!found) throw new Error(`Codex rollout ${idOrPath} not found under ${root}`);
  return { sessionId: idOrPath, path: found };
};

/** True if a transcript file is a Codex rollout (vs Claude Code JSONL). */
export const isCodexFile = (path: string): boolean => {
  try {
    const first = readJsonl(path)[0] as Record<string, unknown> | undefined;
    return first?.type === "session_meta" || (first?.payload != null && "type" in (first as object));
  } catch {
    return false;
  }
};

/** Parse a Codex rollout file into a ParsedSession. */
export const parseCodexSession = (path: string, sessionId: string): ParsedSession => {
  const lines = readJsonl(path);
  const events: TimelineEvent[] = [];
  const turns: Turn[] = [];
  const models = new Set<string>();
  let cwd: string | undefined;
  let startedAt: string | undefined;
  let endedAt: string | undefined;
  let declaredContextWindow: number | undefined;

  let pendingAssistant: number[] = []; // event positions awaiting a token_count
  let turnSeq = 0;

  const pushAssistant = (ev: Omit<TimelineEvent, "index" | "requestId">, ts?: string) => {
    const index = events.length;
    events.push({ ...ev, index, ts, requestId: `codex-turn-${turnSeq}` });
    pendingAssistant.push(index);
  };
  const pushFolded = (ev: Omit<TimelineEvent, "index">, ts?: string) => {
    events.push({ ...ev, index: events.length, ts });
  };

  for (const o of lines) {
    const ts = typeof o.timestamp === "string" ? (o.timestamp as string) : undefined;
    if (ts) {
      if (!startedAt) startedAt = ts;
      endedAt = ts;
    }
    const kind = String(o.type ?? "");
    const p = (o.payload ?? {}) as Record<string, unknown>;

    if (kind === "session_meta") {
      cwd = (p.cwd as string) ?? cwd;
    } else if (kind === "turn_context") {
      if (p.model) models.add(String(p.model));
      cwd = (p.cwd as string) ?? cwd;
    } else if (kind === "response_item") {
      const t = String(p.type ?? "");
      if (t === "message") {
        const role = String(p.role ?? "");
        const text = contentText(p.content);
        if (role === "assistant") {
          pushAssistant({ kind: "assistant-text", title: "Assistant", preview: firstLine(text), body: text, tokensEst: estTokens(text) }, ts);
        } else if (role === "user") {
          pushFolded({ kind: "user-prompt", title: "User prompt", preview: firstLine(text), body: text, tokensEst: estTokens(text) }, ts);
        } else {
          // developer / system instructions injected into context
          pushFolded({ kind: "attachment", title: `${role} instructions`, preview: firstLine(text), body: text, tokensEst: estTokens(text), attachmentType: role, loadedCategory: "other" }, ts);
        }
      } else if (t === "reasoning") {
        const text = contentText(p.content);
        pushAssistant({ kind: "assistant-thinking", title: "Reasoning", preview: text ? firstLine(text) : "(encrypted/not stored)", body: text, tokensEst: estTokens(text) }, ts);
      } else if (t === "function_call" || t === "local_shell_call" || t === "custom_tool_call") {
        const args = str(p.arguments ?? p.action ?? {});
        pushAssistant({ kind: "tool-call", title: String(p.name ?? t), preview: firstLine(args.replace(/\s+/g, " ")), body: args, tokensEst: estTokens(args), toolName: String(p.name ?? t), toolUseId: p.call_id as string | undefined }, ts);
      } else if (t === "web_search_call") {
        const body = str(p.action ?? p);
        pushAssistant({ kind: "tool-call", title: "web_search", preview: firstLine(body), body, tokensEst: estTokens(body), toolName: "web_search" }, ts);
      } else if (t === "function_call_output" || t === "local_shell_call_output") {
        const out = typeof p.output === "string" ? p.output : str(p.output);
        pushFolded({ kind: "tool-result", title: "function_call_output", preview: firstLine(out), body: out, tokensEst: estTokens(out), toolUseId: p.call_id as string | undefined }, ts);
      }
    } else if (kind === "event_msg" && p.type === "token_count") {
      const info = (p.info ?? {}) as Record<string, unknown>;
      const lu = (info.last_token_usage ?? {}) as Record<string, number>;
      if (info.model_context_window) declaredContextWindow = Number(info.model_context_window);
      const input = lu.input_tokens ?? 0; // already includes cached_input_tokens
      if (input > 0) {
        turns.push({
          requestId: `codex-turn-${turnSeq}`,
          ts,
          model: [...models].at(-1) ?? "codex",
          contextTokens: input,
          inputTokens: input,
          cacheReadTokens: lu.cached_input_tokens ?? 0,
          cacheCreationTokens: 0,
          outputTokens: (lu.output_tokens ?? 0) + (lu.reasoning_output_tokens ?? 0),
          eventIndexes: pendingAssistant.slice(),
        });
        pendingAssistant = [];
        turnSeq++;
      }
    }
  }

  // A trailing assistant batch with no final token_count has no measurable
  // context (it is the last generation, not part of any later prompt). Keep its
  // events grouped under the last real turn so history grouping stays correct.
  if (pendingAssistant.length && turns.length) {
    turns[turns.length - 1].eventIndexes.push(...pendingAssistant);
  }

  return {
    provider: "codex",
    sessionId,
    path,
    cwd,
    models: [...models],
    startedAt,
    endedAt,
    events,
    turns,
    compactionIndexes: [],
    subagents: [],
    declaredContextWindow,
  };
};
