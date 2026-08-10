# Fact tables and JSON schema

The contract between the extractor and everything downstream. Two readers need this file: an agent writing its own extractor because the shipped script will not run here, and a program consuming `--format json`.

Field names are identical in `audit.ts` and `audit.py`: camelCase, exactly as written below. Over one frozen corpus the two runtimes write byte-identical fact tables and the same `--format json` values, apart from `window.fromIso`/`toIso`, which are the clock at run time. **A field that is unknown or absent is omitted, never null.** Every ranking is sorted by its metric and then by a stable tiebreaker, so two runs over the same data produce byte-identical output.

## Flags

| Flag | Meaning |
| --- | --- |
| `--days <n>` | Window in days, default 30. Must be positive. |
| `--project <substr>` | Only project dirs containing this substring. Repeatable. |
| `--top <n>` | Rows per ranking, default 15. `--format md` clamps every table to 25 rows on top of this; `--format json` honours it. |
| `--format md\|json` | stdout summary format, default md. |
| `--out <dir>` | Work dir for the fact tables, default `<tmpdir>/harness-audit`. |
| `--root <path>` | Transcripts root, default `<home>/.claude/projects`. |
| `--no-tables` | Compute the aggregates without writing the tables. No work dir is created, and none is printed. |
| `--no-redact` | Write prompts and command output verbatim, secrets included. |
| `--pricing <file>` | JSON overriding the built-in per-model rates, same shape as the table below. |

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

One object with `schemaVersion: 1` and the ten sections below. `--format md` renders the same data as markdown, capped so the summary stays under about 600 lines: rankings truncate to `--top`, again to 25 rows, and state how many rows were dropped.

**Every ranking is an object, not an array:** `{rows, shown, total, dropped}`, where `total` counts the rows that existed before the `--top` cap. The field names listed under each section are the fields of one row inside `rows`.

**`schemaVersion` contract.** `1` is the shape documented here. A consumer should read `schemaVersion` and refuse anything higher than it knows. Additive fields inside a section do not bump it; a renamed or removed field does.

### `window`

`days`, `fromIso`, `toIso`, `filesScanned`, `filesSkipped`, `sessionsByKind` (counts keyed by `SessionKind`), `projectCount`. Every denominator in the report comes from here.

### `tokens`

`totals` (`in`, `out`, `cacheRead`, `cacheCreate`), `byModel` and `byKind` (both records of the same four fields), `byProject` (ranking of `proj`, `totals`, `estCostUsd`, `sessions`), `estCostUsd`, `pricing` (the table actually used), `unpricedModels` (ids that matched no family and were priced as sonnet), and `note`, the provenance line for the rates.

**`byModel` is an attribution, not a measurement.** Usage is recorded per session, not per model, so a session's tokens are split across its models in proportion to per-model call counts. It is exact only for single-model sessions, and no fact table carries tokens per model, so a per-model figure cannot be recomputed from the tables. Do not quote one as measured.

Default rates, USD per million tokens, matched to a family by substring in the model id:

| Family | input | output | cacheWrite | cacheRead |
| --- | --- | --- | --- | --- |
| `opus` | 15 | 75 | 18.75 | 1.50 |
| `sonnet` | 3 | 15 | 3.75 | 0.30 |
| `haiku` | 1 | 5 | 1.25 | 0.10 |

Override the whole table with `--pricing <file>`, same shape. Cost is always presented as estimated.

### `wallClock`

`totalToolSec`, `byTool` (`tool`, `calls`, `totalSec`, `medianSec`, `p95Sec`, `errRate`), `byProject` (`proj`, `calls`, `totalSec`), and `note`, which says out loud that `durSec` includes harness overhead.

### `commands`

`byTotalSec` and `byCount`: the same command-family rows ranked two ways, each carrying `family`, `bin`, `count`, `totalSec`, `medianSec`, `p95Sec`, `errRate`. The two rankings disagree, and the disagreement is the finding. `repeatsInSession`: identical `cmd` re-run inside one session, with `family`, `occurrences` (runs after the first), `sessions`, `wastedSec`. `flagFlailing`: same `bin` with four or more distinct families inside 10 minutes of one session, with `sessions`, `occurrences`, `totalSec`, `sampleCmds`.

### `errors`

`clusters`, keyed by `sig`, each with `count`, `sessionCount`, `projects`, `sampleMsg`, `topTool`. `missingBinaries` (`bin`, `count`, `sessions`, `sampleMsg`): command-not-found and ENOENT targets. `permissionDenied` (`target`, `count`, `sessions`, `sampleMsg`). `retryLoops` (`family`, `count`, `medianRetries`, `sessions`, `sampleCmd`): the same command re-run within 5 minutes of failing.

### `context`

`topSessions`, ranked by `maxCtx`, with `sid`, `proj`, `kind`, `cacheReadTokens`, `cacheCreateTokens`, `estCostUsd`. `bigOutputs`: single tool results ranked by `outChars`, with `sid`, `proj`, `tool`, `arg`, `tokensEst`. `p95CharsByTool`: a record of tool to p95 `outChars`, so a big row can be read against its tool's norm. `reReads` (`arg`, `occurrences`, `sessions`, `wastedTokensEst`): the same file Read more than once in a session. `cacheWriteRatio`: a record keyed by `kind`.

### `web`

`byTool`: a record keyed `WebFetch` / `WebSearch`, each `{calls, sec, chars}`. `totalCalls`, `totalSec`, `totalChars`. `repeatRate`: share of calls that re-fetched a url or query already answered, 0..1. `repeats` (`tool`, `arg`, `count`, `chars`, `sessions`, `sameRun`). `byRun` (`run`, `calls`, `chars`, `agents`).

### `fanout`

`runs`, ranked by estimated cost, each with `run`, `proj`, `agents`, `totals` (the four token fields), `estCostUsd`, `medianFirstTurnCacheCreate`. `lowYield` (`sid`, `run`, `proj`, `outTokens`, `cacheReadTokens`, `yield`, `estCostUsd`): agents whose `outTokens` sit in the bottom decile relative to their `cacheReadTokens`. Plus two scalars: `agentsWithFirstTurnCacheWrite` and `totalFirstTurnCacheCreate`.

### `human`

`humanTurnCount`, `interrupts`, `corrections` (a ranking of `bucket`, `count`, `samples` — up to three verbatim turns), and `repeatedRequests` (`label`, `count`, `sessions`, `samples`), near-duplicate human turns clustered across different sessions.

### `projects`

A ranking, per project: `proj`, `sessions`, `totals`, `estCostUsd`, `bashSec`, `topCommands` (the five costliest families), and `onDisk` — `cwd`, `claudeMd`, `agentsMd`, `settingsJson`, `packageJson`, `packageManager`, `scriptNames`. For `package.json` only the package manager and the script **names** are read, never file contents.

---

# Privacy

`user-msgs.jsonl` holds real prompts; `bash.jsonl` holds real commands and output. Secret redaction is on by default and covers provider key shapes (`sk-`, `gh[opusr]_`, `AKIA`, `xox`, JWTs and more), `Authorization:` headers, inline URL credentials, PEM private-key blocks, and `KEY=value` assignments whose key name contains token, secret, password, or key, replacing each with `[REDACTED]`. Only the value token is replaced, so `API_KEY=... bun run x` keeps the command. Long base64 and hex runs are redacted **only** next to a credential keyword and above an entropy threshold, so commit hashes, UUIDs, and file paths survive. It is best-effort, not a guarantee. `--no-redact` writes everything verbatim, and the script says so on stderr. The tables stay on disk in the `--out` dir until the user deletes them.
