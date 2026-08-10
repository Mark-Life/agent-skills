# Transcript retention across harnesses

How long each coding agent keeps session transcripts on disk, and what setting changes it. Every audit this skill runs is bounded by these numbers: a rate computed over "the last 90 days" is really over whatever survived.

**Two of the seven delete transcripts on their own: Claude Code and Gemini CLI.** The rest grow without bound until the user removes files by hand.

Verified August 2026 against docs and source. Retention behaviour moves between releases — check the linked source before quoting a number back to a user as current.

| Harness | Transcripts live at | Format | Auto-deletes | Setting |
| --- | --- | --- | --- | --- |
| **Claude Code** | `~/.claude/projects/<encoded-cwd>/` | JSONL | Yes, at startup | `cleanupPeriodDays`, default **30**, min 1 |
| **Codex CLI** | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | JSONL | No | None for rollouts |
| **OpenCode** | `~/.local/share/opencode/opencode.db` | SQLite | No | None |
| **Pi** | `~/.pi/agent/sessions/<encoded-cwd>/<ts>_<uuid>.jsonl` | JSONL | No | None (`sessionDir` moves them only) |
| **Gemini CLI** | `~/.gemini/tmp/<project-hash>/chats/session-*.json` | JSON | Yes, older than 30 days | `general.sessionRetention` |
| **Cursor CLI** | `~/.cursor/chats/<md5-cwd>/<session>/store.db`, plus `~/.cursor/projects/<workspace>/agent-transcripts/` | SQLite + JSONL | No | None |
| **Amp** | Server-side. Locally only `~/.cache/amp/logs/threads/*.log` | — | Logs at 7 days | None |

## Claude Code

`cleanupPeriodDays` in `~/.claude/settings.json`: *"Claude Code deletes session files and other application data older than this period at startup."* Default 30, minimum 1 ([settings docs](https://code.claude.com/docs/en/settings)).

```json
{ "cleanupPeriodDays": 180 }
```

Raising it is the one change that makes every future run of this audit better, and the only cost is disk. Transcripts are uncompressed JSONL carrying full tool output, so a heavy user runs to gigabytes a year — worth saying out loud alongside the suggestion.

## Codex CLI

Rollouts are never deleted automatically. `codex archive` and `codex delete` are the manual paths.

The `[history]` block in `~/.codex/config.toml` — `persistence` (`"save-all"` default, or `"none"`) and `max_bytes` — governs **only `~/.codex/history.jsonl`**, the one-line-per-prompt input log. It does not touch `sessions/`. The published config docs blur these two; the struct doc comment in `codex-rs/config/src/types.rs` is explicit that the block is about `history.jsonl`. Do not offer `max_bytes` to a user who wants to cap transcript growth.

Two things that do expire, neither of them transcripts: `logs_2.sqlite` prunes at 10 days, shell snapshots at 3. Rollouts older than 7 days get zstd-compressed in place (`.jsonl` → `.jsonl.zst`, content kept) behind the `local_thread_store_compression` feature flag, which ships disabled.

## OpenCode

Sessions moved from per-project JSON files into one SQLite database (`session`, `session_message`, `part` tables, Drizzle ORM). The [troubleshooting docs](https://opencode.ai/docs/troubleshooting) still describe the old `<project-slug>/storage/` layout — outdated. The repo now lives at [`anomalyco/opencode`](https://github.com/anomalyco/opencode).

Nothing deletes session rows: a maintainer confirms it directly on [issue #4980](https://github.com/anomalyco/opencode/issues/4980). `time_archived` on a session row is archiving, not deletion. `compaction.prune` in the config drops old tool output from the **context window**, not from the database.

## Pi

`@mariozechner/pi`, now at [`earendil-works/pi`](https://github.com/earendil-works/pi). One JSONL per session; entries form a tree keyed on `id`/`parentId`, so resuming a branch appends in place rather than starting a new file. The only deletion path is user-driven: `/resume`, select, Ctrl+D, confirm. `sessionDir` in `~/.pi/agent/settings.json` (or `--session-dir`, or `PI_CODING_AGENT_SESSION_DIR`) relocates the tree without changing retention.

## Gemini CLI

The only harness besides Claude Code that expires transcripts, and the one with the richest control. `general.sessionRetention` in `~/.gemini/settings.json` takes `enabled`, `maxAge`, `maxCount`, and `minRetention`; the default is on, 30 days, no count cap, with a one-day floor.

## Reading a foreign corpus

This skill parses Claude Code transcripts in v1. Extending it to another harness means writing an extractor to the five-table contract in `stats.md` — the layouts above are the starting point, and the SQLite-backed ones (OpenCode, Cursor) need a query rather than a file walk.
