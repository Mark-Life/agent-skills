/** Parse a Claude Code JSONL transcript into a normalized ParsedSession. */
import { readFileSync } from "node:fs";
import type {
  LoadedCategory,
  ParsedSession,
  RawLine,
  TimelineEvent,
  Turn,
} from "./types.ts";
import { estTokens, firstLine } from "./tokens.ts";

/** Read a JSONL file into parsed lines, skipping blanks and malformed rows. */
export const readJsonl = (path: string): RawLine[] => {
  const out: RawLine[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* tolerate partial last line of a live session */
    }
  }
  return out;
};

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));

/** Classify an attachment into the budget category it loads, if any. */
const attachmentCategory = (a: Record<string, unknown>): LoadedCategory => {
  const t = String(a.type ?? "");
  switch (t) {
    case "file": {
      const fn = String(a.filename ?? "").toLowerCase();
      return fn.endsWith("claude.md") || fn.endsWith("agents.md") ? "claude-md" : "file";
    }
    case "skill_listing":
      return "skills";
    case "agent_listing_delta":
      return "agents";
    case "deferred_tools_delta":
      return "tools";
    case "mcp_instructions_delta":
      return "mcp";
    case "opened_file_in_ide":
    case "selected_lines_in_ide":
    case "edited_text_file":
      return "ide";
    case "task_reminder":
    case "hook_success":
    case "date_change":
    case "ultra_effort_enter":
    case "workflow_keyword_request":
      return "reminder";
    default:
      return "other";
  }
};

/** Extract human-readable body text from an attachment for the expanded view. */
const attachmentBody = (a: Record<string, unknown>): string => {
  const t = String(a.type ?? "");
  if (t === "file") {
    const c = a.content as Record<string, unknown> | string | undefined;
    if (typeof c === "string") return c;
    const file = (c as Record<string, unknown>)?.file as Record<string, unknown> | undefined;
    if (file && typeof file.content === "string") return file.content;
    return str(c);
  }
  if (t === "skill_listing") return str(a.content);
  if (t === "agent_listing_delta") return (a.addedLines as string[] | undefined)?.join("\n") ?? "";
  if (t === "deferred_tools_delta") return (a.addedNames as string[] | undefined)?.join(", ") ?? "";
  if (t === "mcp_instructions_delta") return (a.addedBlocks as string[] | undefined)?.join("\n\n") ?? str(a);
  if (t === "edited_text_file") return str(a.snippet);
  if (t === "selected_lines_in_ide") return str(a.content);
  if (t === "hook_success") return `$ ${str(a.command)}\n${str(a.stdout)}${str(a.stderr)}`;
  return str(a.content ?? a);
};

/** Short title for an attachment row. */
const attachmentTitle = (a: Record<string, unknown>): string => {
  const t = String(a.type ?? "attachment");
  if (t === "file" || t === "edited_text_file" || t === "opened_file_in_ide") {
    const fn = String(a.filename ?? a.displayPath ?? "");
    return `${t}: ${fn.split("/").pop() || fn}`;
  }
  if (t === "skill_listing") return `skill_listing (${a.skillCount ?? "?"} skills)`;
  return t;
};

/**
 * Parse a Claude Code transcript file into a ParsedSession.
 * Token usage is taken verbatim from assistant `usage`; body sizes are chars/4.
 *
 * @param opts.includeSidechainTurns - count `isSidechain` assistant turns toward
 *   the turn/usage curve. Off by default (a main transcript must not absorb its
 *   subagents' turns); on when parsing a subagent's *own* file, whose every line
 *   is flagged `isSidechain`.
 */
export const parseClaudeSession = (
  path: string,
  sessionId: string,
  opts: { includeSidechainTurns?: boolean } = {},
): ParsedSession => {
  const lines = readJsonl(path);
  const events: TimelineEvent[] = [];
  const turnsById = new Map<string, Turn>();
  const compactionIndexes: number[] = [];
  const models = new Set<string>();
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  let title: string | undefined;
  let version: string | undefined;
  let startedAt: string | undefined;
  let endedAt: string | undefined;

  lines.forEach((o, index) => {
    const type = String(o.type ?? "");
    const ts = typeof o.timestamp === "string" ? o.timestamp : undefined;
    if (ts) {
      if (!startedAt) startedAt = ts;
      endedAt = ts;
    }
    if (typeof o.cwd === "string" && !cwd) cwd = o.cwd;
    if (typeof o.gitBranch === "string") gitBranch = o.gitBranch;
    if (typeof o.version === "string") version = o.version;
    const isSidechain = o.isSidechain === true;

    if (type === "ai-title" && typeof o.aiTitle === "string") {
      title = o.aiTitle;
      return;
    }

    if (type === "attachment") {
      const a = (o.attachment ?? {}) as Record<string, unknown>;
      const body = attachmentBody(a);
      events.push({
        index,
        kind: "attachment",
        ts,
        isSidechain,
        title: attachmentTitle(a),
        preview: firstLine(body) || String(a.type ?? ""),
        body,
        tokensEst: estTokens(body),
        attachmentType: String(a.type ?? ""),
        loadedCategory: attachmentCategory(a),
      });
      return;
    }

    if (type === "user") {
      const msg = (o.message ?? {}) as Record<string, unknown>;
      const content = msg.content;
      if (o.isCompactSummary === true) compactionIndexes.push(index);
      if (typeof content === "string") {
        events.push({
          index,
          kind: o.isCompactSummary === true ? "compaction" : "user-prompt",
          ts,
          isSidechain,
          title: o.isCompactSummary === true ? "Context compaction (summary)" : "User prompt",
          preview: firstLine(content),
          body: content,
          tokensEst: estTokens(content),
        });
      } else if (Array.isArray(content)) {
        for (const b of content as Array<Record<string, unknown>>) {
          if (b?.type === "tool_result") {
            const raw = b.content;
            const text = typeof raw === "string" ? raw : str(raw);
            events.push({
              index,
              kind: "tool-result",
              ts,
              isSidechain,
              title: `tool_result${b.is_error ? " (error)" : ""}`,
              preview: firstLine(text),
              body: text,
              tokensEst: estTokens(text),
              isError: b.is_error === true,
              toolUseId: typeof b.tool_use_id === "string" ? b.tool_use_id : undefined,
            });
          } else if (b?.type === "text") {
            events.push({
              index,
              kind: "user-prompt",
              ts,
              isSidechain,
              title: "User message",
              preview: firstLine(str(b.text)),
              body: str(b.text),
              tokensEst: estTokens(str(b.text)),
            });
          }
        }
      }
      return;
    }

    if (type === "assistant") {
      const msg = (o.message ?? {}) as Record<string, unknown>;
      const model = String(msg.model ?? "unknown");
      models.add(model);
      const requestId = typeof o.requestId === "string" ? o.requestId : `line-${index}`;
      const usage = (msg.usage ?? {}) as Record<string, number>;
      const inputTokens = usage.input_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      const cacheCreate = usage.cache_creation_input_tokens ?? 0;
      const contextTokens = inputTokens + cacheRead + cacheCreate;
      // Sidechain (subagent) turns run in their own window — never count them
      // toward the main session's context curve, unless this file *is* the
      // subagent's transcript (every line flagged isSidechain).
      if (!turnsById.has(requestId) && contextTokens > 0 && (opts.includeSidechainTurns || !isSidechain)) {
        turnsById.set(requestId, {
          requestId,
          ts,
          model,
          contextTokens,
          inputTokens,
          cacheReadTokens: cacheRead,
          cacheCreationTokens: cacheCreate,
          outputTokens: usage.output_tokens ?? 0,
          eventIndexes: [],
        });
      }
      const turn = turnsById.get(requestId);
      for (const b of (msg.content ?? []) as Array<Record<string, unknown>>) {
        if (b?.type === "thinking") {
          const text = str(b.thinking);
          events.push({
            index,
            kind: "assistant-thinking",
            ts,
            requestId,
            isSidechain,
            title: "Thinking",
            preview: text ? firstLine(text) : "(content not stored in transcript)",
            body: text,
            tokensEst: estTokens(text),
          });
        } else if (b?.type === "text") {
          const text = str(b.text);
          events.push({
            index,
            kind: "assistant-text",
            ts,
            requestId,
            isSidechain,
            title: "Assistant",
            preview: firstLine(text),
            body: text,
            tokensEst: estTokens(text),
          });
        } else if (b?.type === "tool_use") {
          const inputStr = JSON.stringify(b.input ?? {}, null, 2);
          events.push({
            index,
            kind: "tool-call",
            ts,
            requestId,
            isSidechain,
            title: String(b.name ?? "tool"),
            preview: firstLine(inputStr.replace(/\s+/g, " ")),
            body: inputStr,
            tokensEst: estTokens(inputStr),
            toolName: String(b.name ?? "tool"),
            toolUseId: typeof b.id === "string" ? b.id : undefined,
          });
        }
        if (turn) turn.eventIndexes.push(events.length - 1);
      }
      return;
    }

    if (type === "summary") {
      const text = str(o.summary);
      events.push({
        index,
        kind: "summary",
        ts,
        title: "Rolling summary",
        preview: firstLine(text),
        body: text,
        tokensEst: estTokens(text),
      });
      return;
    }

    if (type === "system") {
      const text = str(o.content ?? o.subtype ?? "");
      events.push({
        index,
        kind: "system",
        ts,
        isSidechain,
        title: `system: ${String(o.subtype ?? "event")}`,
        preview: firstLine(text),
        body: text,
        tokensEst: 0,
      });
    }
    // mode / permission-mode / last-prompt / pr-link / queue-operation /
    // file-history-snapshot are control metadata — intentionally dropped.
  });

  const turns = [...turnsById.values()];
  return {
    provider: "claude-code",
    sessionId,
    path,
    cwd,
    gitBranch,
    title,
    version,
    models: [...models],
    startedAt,
    endedAt,
    events,
    turns,
    compactionIndexes,
    subagents: [],
  };
};
