---
name: session-report
description: Generate a self-contained HTML report that debugs what is in a Claude Code or Codex session's context window and how every token is spent — context budget, the hidden cost of retained thinking, the dumb-zone cutoff, loaded CLAUDE.md/skills, and the full history.
when_to_use: Run `/session-report <session-id>` to inspect or debug a session's context usage — e.g. "what's eating my context", "why did this session get dumb/degraded", "is my CLAUDE.md too big", "show the token budget / timeline / history for this session". Accepts a session id or a transcript path.
argument-hint: "[session-id]"
arguments: session_id
disable-model-invocation: true
version: 1.0.0
---

# Session Report

Generates a single self-contained HTML file that reconstructs an agent session from its
transcript and shows **what is in the model's context window and how every token is spent** —
a forensic debugger for context bloat and the "dumb zone" (context-rot past ~40% of the window).

This is a **user-invoked** command (`/session-report`); it is not auto-invoked by the model.
The session id is passed as the `$session_id` argument.

## What the report shows

- **Verdict header + gauge**: peak context vs window, health (Healthy / Degrading / Rotting), one-click jump chips to every issue.
- **Context budget at peak**: a stacked bar + table partitioning the peak context into system+tools, listings (skills/agents/tools), CLAUDE.md/memory, opened files, user prompts, tool results, assistant text, **thinking**, and an honest "unattributed (tool schemas/overhead)".
- **Context-growth timeline**: inline-SVG stacked area of real context size per turn, with the dumb-zone band, the 200K-model ghost line, compaction cliffs, peak marker, and the first dumb-zone crossing.
- **Loaded artifacts**: CLAUDE.md/AGENTS.md/memory sizes (read from disk), skill/agent/tool listings, opened files — sortable, with "trim me" callouts.
- **Biggest items** and a **full collapsible history** of every event (tool calls, results, attachments) with search/filter and the dumb-zone divider inline.

## How to run

The generator is a zero-dependency TypeScript script with **no build step**. Run it from the
skill's `scripts/` dir with the requested session id (`$session_id`). Pick whichever runtime the
user has — they need only one:

```bash
# Node >= 22.18 / >= 23.6 (native TS type-stripping; most Claude Code users have Node):
node generate-report.ts "$session_id" --open
# Bun:
bun run generate-report.ts "$session_id" --open
# Older Node (no type-stripping) — no install needed, npx fetches it:
npx tsx generate-report.ts "$session_id" --open
```

Detect what's available (e.g. `command -v node bun`) and use that. A direct transcript path and
options also work, e.g. `node generate-report.ts /path/to/<id>.jsonl --out report.html --window 1000000`.

If `$session_id` is empty (the user ran `/session-report` with no argument), list recent
Claude Code sessions and ask which one — e.g.
`ls -t ~/.claude/projects/*/*.jsonl | head` — then re-run with the chosen id.

It finds the transcript by id under `~/.claude/projects/*/`, parses it, reads the relevant
CLAUDE.md/AGENTS.md/memory files from disk, and writes the HTML (then `--open`s it if asked).
Print the output path to the user.

Options:
- `--out <file>` — output path (default `./ccx-<id>.html`).
- `--window <tokens>` — context-window size. **Important:** the model id in the transcript does
  not record whether the session ran the 200K or 1M window. The generator infers 1M only if peak
  context already exceeded 200K. **If you know the session ran a 1M-context model (e.g. Opus 4.x
  with the 1M beta) but peaked under 200K, pass `--window 1000000`** or the report will look
  alarmingly full. The header has a live override too.
- `--dumb-zone <frac>` — degradation threshold as a fraction of the window (default `0.40`).
- `--no-subagents` — skip parsing subagent transcripts.
- `--codex` — force Codex-rollout parsing (auto-detected by default from the file/path).

## Key concepts (so you can interpret the report for the user)

- **Ground truth vs estimate**: per-turn context size is exact from `usage` metadata(`input + cache_read + cache_creation`); per-item sizes are chars/4 estimates.
- **Thinking is the usual hidden giant**: thinking text is *not* stored in the transcript, but it is retained in context. The report recovers it from real `output_tokens` minus visible text/tool_use — so a huge "thinking" band is accurate, not a guess.
- **System+tools residual**: first-turn context minus visible loads = the fixed floor (system prompt + tool schemas + global CLAUDE.md). Not in the transcript; partly attributed from disk.
- **Unattributed** = real peak minus everything attributable ≈ growing tool-definition schemas
  (from tool search / many MCP servers), per-turn reminders, and encoding overhead. Large value ⇒ tool bloat.

## Codex sessions

Codex rollouts (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`) are also supported; Codex even records `model_context_window` directly. Pass the rollout path. See `scripts/lib/codex.ts`.

## Notes

- Output is a single HTML file — no server, no network, no external libraries. Open in any browser.
- All transcript content is HTML-escaped; the report is safe to open even with untrusted content.
- Large sessions produce multi-MB files (everything is inlined and collapsed by default).
