# Fact tables and JSON schema

The contract between the extractor and everything downstream. Two readers need this file: an agent writing its own extractor because the shipped script will not run here, and a program consuming `--format json`.

Field names are identical in `audit.ts` and `audit.py`: camelCase, exactly as written below. **A field that is unknown or absent is omitted, never null.** Every ranking is sorted by its metric and then by a stable tiebreaker, so two runs over the same data produce byte-identical output.

## Where the data comes from

Transcripts live under the root (`~/.claude/projects` by default) as `<encoded-project>/<sid>.jsonl` for main sessions, and **nested** as `<encoded-project>/<parent-sid>/subagents/**/agent-*.jsonl` for subagents and workflow agents. Walk the tree recursively: a `*/*.jsonl` glob finds about a tenth of the corpus. Skip `journal.jsonl` and `*.meta.json`. Each line is a JSON object; a malformed line is skipped, not fatal.

`kind` follows depth: a transcript directly under the project dir is `main`; one under `subagents/workflows/wf_*/` is `workflow-agent` with `run` set to the `wf_*` dir name; anything else nested is `subagent`.

Tool calls are `type: "assistant"` messages with `message.content[]` blocks of `type: "tool_use"` carrying `id`, `name`, `input`. Results are `type: "user"` messages with blocks of `type: "tool_result"` carrying `tool_use_id`, `content` (a string or an array of `{type:"text",text}`), and `is_error`. Join on `tool_use_id` to recover the tool name, its input, and the duration. Usage sits at `message.usage`: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`; a turn's context size is the sum of all three.

## What `durSec` measures

`durSec` is the result timestamp minus the call timestamp. It includes model and harness overhead, queueing, and any time the call spent waiting for the user to approve a permission prompt. It does not isolate the process runtime. Treat it as an upper bound on the command's own cost and as approximate everywhere: a fast command behind an approval prompt reads as a slow command. Summing `durSec` across a window does not give elapsed human time, because background and parallel calls overlap.

---

# Tables

Five JSONL files in the `--out` dir, one object per line. `--no-tables` computes the aggregates without writing them.

## `sessions.jsonl` : SessionRow

One row per transcript file.

| Field | Type | Meaning |
| --- | --- | --- |
| `sid` | string | Session id. |
| `proj` | string | Encoded project dir name under the transcripts root. |
| `file` | string | Absolute path to the transcript. |
| `bytes` | number | File size. |
| `cwd` | string? | Working directory recorded in the transcript. The key to per-repo analysis. |
| `branch` | string? | Git branch recorded in the transcript. |
| `ver` | string? | Agent CLI version recorded in the transcript. |
| `start` | number? | Epoch seconds of the first event. |
| `end` | number? | Epoch seconds of the last event. |
| `kind` | `"main"` \| `"subagent"` \| `"workflow-agent"` | Position in the session tree. |
| `parent` | string? | Parent session id, for subagents and workflow agents. |
| `run` | string? | Workflow run id (the `wf_*` dir name), for workflow agents. |
| `assistantMsgs` | number | Assistant messages. |
| `userMsgs` | number | User-role messages, human and harness alike. |
| `inTokens` | number | Summed `input_tokens`. |
| `outTokens` | number | Summed `output_tokens`. |
| `cacheReadTokens` | number | Summed `cache_read_input_tokens`. |
| `cacheCreateTokens` | number | Summed `cache_creation_input_tokens`. |
| `maxCtx` | number | Largest single request: input + cacheRead + cacheCreate. |
| `firstTurnCacheCreate` | number | `cacheCreate` on the session's first model call: the fan-out prefix cost. |
| `models` | Record<string, number> | Model id to request count. |
| `tools` | Record<string, number> | Tool name to call count. |
| `interrupts` | number | `toolUseResult.interrupted === true` plus turns containing `"[Request interrupted"`. |
| `errors` | number | Errored tool results. |

## `tools.jsonl` : ToolRow

One row per tool call, joined to its result. Bash calls appear here too, and get a fuller row carrying the command and its normalised family in `bash.jsonl`: aggregate tool-level wall-clock from this table, and anything about commands from that one.

| Field | Type | Meaning |
| --- | --- | --- |
| `sid`, `proj`, `kind` | | As in SessionRow. |
| `t` | number? | Epoch seconds of the call. |
| `tool` | string | Tool name. |
| `durSec` | number? | Result time minus call time. Approximate: see above. |
| `err` | boolean | `is_error` on the joined result. |
| `outChars` | number | Characters of result content. |
| `arg` | string? | The tool's primary argument: `file_path` for Read/Edit/Write, `pattern` for Grep/Glob, `url` for WebFetch, `query` for WebSearch, `subagent_type` for Agent/Task. |
| `side` | boolean | True when the row comes from a sidechain (subagent) turn. |

## `bash.jsonl` : BashRow

One row per Bash call: everything in ToolRow except `tool` and `arg`, plus the command.

| Field | Type | Meaning |
| --- | --- | --- |
| `sid`, `proj`, `kind`, `t`, `durSec`, `err`, `outChars`, `side` | | As in ToolRow. |
| `cmd` | string | The command. Redacted unless `--no-redact`. |
| `desc` | string? | The call's description field. |
| `family` | string | Normalised command family, e.g. `bun run typecheck`, `git log`. Group by this. |
| `bin` | string | Base binary, e.g. `bun`, `git`, `rg`. |
| `bg` | boolean | Ran in the background. |
| `out` | string | First 200 chars of output, 600 when `err`. Redacted unless `--no-redact`. |

## `user-msgs.jsonl` : UserMsgRow

One row per user-role turn, human and harness alike.

| Field | Type | Meaning |
| --- | --- | --- |
| `sid`, `proj`, `kind` | | As in SessionRow. |
| `t` | number? | Epoch seconds. |
| `text` | string | Truncated to 4000 chars. Redacted unless `--no-redact`. |
| `side` | boolean | Sidechain turn. |
| `human` | boolean | Real human input: `kind === "main"`, not `side`, and not a harness echo. |

`human` is `false` for `isMeta` turns, `<task-notification>`, `<system-reminder>`, `<command-name>`, `[Request interrupted`, and tool-result-only turns. **Filter to `human: true` before counting anything about the user.** Text arrives either as a plain string at `message.content` or as `{type:"text"}` blocks inside the array; handle both.

## `errors.jsonl` : ErrorRow

One row per errored tool result.

| Field | Type | Meaning |
| --- | --- | --- |
| `sid`, `proj`, `kind`, `t` | | As above. |
| `tool` | string | Tool that failed. |
| `input` | string | Tool input JSON, truncated to 600 chars. Redacted unless `--no-redact`. |
| `msg` | string | Error text, truncated to 600 chars. Redacted unless `--no-redact`. |
| `sig` | string | Cluster key: paths, numbers, hashes, and quoted strings masked. Group by this. |

---

# `--format json`

One object with `schemaVersion: 1` and the ten sections below. `--format md` renders the same data as markdown, capped so the summary stays under about 600 lines: rankings truncate to `--top` and state how many rows were dropped.

**`schemaVersion` contract.** `1` is the shape documented here. A consumer should read `schemaVersion` and refuse anything higher than it knows. Additive fields inside a section do not bump it; a renamed or removed field does.

### `window`

`days`, `fromIso`, `toIso`, `filesScanned`, `filesSkipped`, `sessionsByKind` (counts keyed by `SessionKind`), `projectCount`. Every denominator in the report comes from here.

### `tokens`

`totals` (`in`, `out`, `cacheRead`, `cacheCreate`), `byModel`, `byKind`, `byProject` (top N), and `estCostUsd` with the pricing block echoed alongside it and marked an estimate. `unpricedModels` lists model ids that matched no family and were priced as sonnet, so nothing is mispriced silently.

Default rates, USD per million tokens, matched to a family by substring in the model id:

| Family | input | output | cacheWrite | cacheRead |
| --- | --- | --- | --- | --- |
| `opus` | 15 | 75 | 18.75 | 1.50 |
| `sonnet` | 3 | 15 | 3.75 | 0.30 |
| `haiku` | 1 | 5 | 1.25 | 0.10 |

Override the whole table with `--pricing <file>`, same shape. Cost is always presented as estimated.

### `wallClock`

`totalToolSec`, `byTool`, `byProject`, and a note that `durSec` is approximate.

### `commands`

`families` ranked by `totalSec` and again by `count`, each row carrying `count`, `totalSec`, `medianSec`, `p95Sec`, `errRate`. `repeatsInSession`: identical `cmd` re-run inside one session, with `occurrences` and `wastedSec`. `flagFlailing`: same `bin` with four or more distinct normalised commands inside one session within 10 minutes, with `sessions`, `occurrences`, `totalSec`.

### `errors`

Clusters keyed by `sig`, each with `count`, `sessionCount`, `projects`, `sampleMsg`, `topTool`. Plus `missingBinaries` (command-not-found and ENOENT targets), `permissionDenied`, and `retryLoops` (same normalised command re-run within 5 minutes of an error, with `count` and `medianRetries`).

### `context`

Sessions ranked by `maxCtx`. `bigOutputs`: tool calls ranked by `outChars`, each with its `arg`, plus the p95 `outChars` per tool. `reReads`: same `arg` Read more than once in a session, with `occurrences` and `wastedTokensEst`. `cacheWriteRatio` by `kind`.

### `web`

`WebFetch` and `WebSearch` counts, seconds, and chars. `repeats`: the same url or query fetched more than once, with `count`, `chars`, and whether the repeat happened inside one run. Concentration by `run`.

### `fanout`

Workflow runs ranked by estimated cost, each with `agents`, `tokens`, `estCostUsd`, `medianFirstTurnCacheCreate`. `lowYield`: agents whose `outTokens` sit in the bottom decile relative to their `cacheReadTokens`.

### `human`

`humanTurnCount`, `interrupts`, `corrections` (turns matching correction signals, bucketed and counted, with 2-3 verbatim samples per bucket), and `repeatedRequests` (near-duplicate human turns clustered across different sessions).

### `projects`

Per project: `sessions`, `tokens`, `bashSec`, `topCommands`, and what exists on disk at `cwd` — `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `package.json`. For `package.json` only the package manager and the script **names** are reported, never file contents.

---

# Privacy

`user-msgs.jsonl` holds real prompts; `bash.jsonl` holds real commands and output. Secret redaction is on by default and covers API-key shapes (`sk-`, `ghp_`, `AKIA`, long base64 and hex runs), `Authorization:` headers, PEM private-key blocks, and `KEY=value` assignments whose key name contains token, secret, password, or key, replacing each with `[REDACTED]`. It is best-effort, not a guarantee. `--no-redact` writes everything verbatim. The tables stay on disk in the `--out` dir until the user deletes them.
