---
name: harness-doctor
description: "Audit the last N days of agent transcripts across every project at once and find where wall-clock, tokens, and repeated human corrections are going. A zero-dependency script mines every transcript into five fact tables and prints a summary; the model reads the numbers, digs into the tables, and returns a ranked, copy-pasteable list of fixes to the repo, the config, and the rules files."
when_to_use: "Run `/harness-doctor [days]` for the fleet view across many sessions and every project on this machine — e.g. \"why is my agent so slow\", \"where are my tokens going\", \"what do I keep correcting it about\", \"which commands waste the most time\", \"audit my last 30 days\"."
argument-hint: "[days]"
arguments: days
disable-model-invocation: true
version: 1.0.0
---

# Harness Doctor

**Harness Doctor is the fleet view over the agent's own history.** It mines the last `$days` of agent transcripts across every project on this machine and answers one question — where did the wall-clock, the tokens, and the repeated corrections go, and what change stops the bleeding. It reads the whole session tree, workflow and subagent transcripts included, and turns it into five fact tables plus a ranked fix list. The waste is invisible from inside any single session: a command that costs 9 seconds is nothing until you see it ran 1,400 times.

This is a **user-invoked** command (`/harness-doctor`); the window in days arrives as `$days` and defaults to 30.

## How to run

The auditor is zero-dependency with **no build step**, shipped twice: `scripts/audit.ts` and `scripts/audit.py`. They take the same flags and write the same tables — pick whichever runtime exists. Detect with `command -v node bun python3` on macOS/Linux, or `where node bun python` on Windows, then run from the skill's `scripts/` dir:

```bash
node audit.ts --days "$days"        # Node >= 22.18 (native TS type-stripping)
bun run audit.ts --days "$days"     # Bun
npx tsx audit.ts --days "$days"     # older Node, no install needed
python3 audit.py --days "$days"     # no JS runtime at all
```

The summary goes to **stdout**; progress goes to **stderr**, so `node audit.ts --format json > facts.json` stays clean. The last stdout line in `md` mode is the work dir holding the fact tables.

The rest of the flags: `--project <substr>` narrows to project dirs matching the substring (repeatable), `--top <n>` sets rows per ranking (default 15), `--format json` emits the machine shape documented in `reference/stats.md`, `--out <dir>` moves the fact tables (default `<tmpdir>/harness-audit`), `--root <path>` points at a different transcripts root, `--no-tables` computes the aggregates without writing the tables to disk, `--no-redact` turns off secret redaction, `--pricing <file>` overrides the built-in price table.

## If the script does not run here

**The fact tables are the contract, not the script.** When neither runtime works, or the user's agent stores transcripts somewhere other than `~/.claude/projects`, write your own extractor: walk the transcript tree, emit `sessions.jsonl`, `tools.jsonl`, `bash.jsonl`, `user-msgs.jsonl`, and `errors.jsonl` with the exact field names in `reference/stats.md`, then continue from *Read the summary, then dig* unchanged. Every angle downstream reads those five files and nothing else.

Two things that trip an extractor, both worth checking in your own output: subagent and workflow transcripts are **nested** under `<project>/<parent-sid>/subagents/**/agent-*.jsonl`, so a `*/*.jsonl` glob finds roughly a tenth of the corpus; and `journal.jsonl` and `*.meta.json` are not transcripts.

When a full scan is too slow, rerun with `--days 7` and **say in the report that the window is 7 days**, so every number is read against the right denominator.

## Read the summary, then dig

The script does the counting. Your job starts after it: read the summary, pick the angles the numbers point at, then go into the fact tables for the specifics the summary only ranks.

`reference/angles.md` holds seven angles, each with what to compute from which table, what a good finding reads like, and the trap that angle carries. Read it before you dig. Each summary section routes to one:

| Summary section | Angle | Reads |
| --- | --- | --- |
| `commands` | Bash economics | `bash.jsonl` |
| `errors` | Errors and environment gaps | `errors.jsonl`, `bash.jsonl` |
| `tokens`, `context` | Context and token economics | `sessions.jsonl`, `tools.jsonl` |
| `human` | Human friction | `user-msgs.jsonl` |
| `fanout` | Workflow and subagent efficiency | `sessions.jsonl` |
| `projects` | Per-repo setup gaps | `sessions.jsonl` + the repo on disk |
| `web` | Web research | `tools.jsonl` |

For a thorough run, **fan out one agent per angle**, each given the work dir path, the angle's section of `reference/angles.md`, and the instruction to recompute its own numbers before reporting. Then merge. For a quick run, take the two or three angles with the largest numbers in the summary and work them yourself.

Dig with `jq`, `rg`, or a throwaway script over the JSONL — the tables are line-oriented and sized for it. Move data with code: filter and aggregate on disk, and read only the rows you will quote.

## Verify before you report

**Every number in the report is one you recomputed or read off a table.** Not one you inferred, not one you carried across a unit change, not one an angle agent handed you without a source. Say which table and which filter produced it.

Two failures from a real run of this analysis, both of which passed a casual read:

- **Spend reported as saving.** The headline claimed a large dollar figure would be recovered, when the figure was the estimated *total* cost of the window. A saving is a difference between two numbers you can both name: before, after, and the change that moves one to the other.
- **The skill's own text counted as user complaints.** A keyword scan for correction words matched harness-generated turns and quoted instructions echoing through transcripts, reporting 41 complaints where 24 were real. Count only rows with `human: true` in `user-msgs.jsonl`, and read the sample text of every bucket before you trust its count.

## What to produce

A **ranked, copy-pasteable fix list**, ordered by impact over effort, not grouped by angle. Each fix carries the measured number it is based on and the exact text to apply: the `package.json` script line, the `CLAUDE.md` sentence, the `settings.json` entry, the command to run. "Consider caching your builds" is not a fix; `"typecheck": "tsc -b --incremental"` next to "`bun run typecheck` ran 412 times, 3.9h total, median 34s" is.

One row per fix, in this shape:

> **1. Make typecheck incremental** : `bun run typecheck` ran 412 times, 3.9h total tool time, median 34s (`commands`, `bash.jsonl`).
> Add to `package.json`: `"typecheck": "tsc -b --incremental"`, and `*.tsbuildinfo` to `.gitignore`.
> Effort: one line. Applies to `~/Code/app` only.

A fix with no number attached does not ship. Cut it or go measure it.

**Done when** every fix row names its number, the table that number came from, and the exact text to apply — and every summary section that ranked something either produced a fix or carries one line saying why its numbers are not waste.

## Close by widening the window

The corpus is capped by what the harness kept. Claude Code deletes session files older than **`cleanupPeriodDays`** at startup — **default 30, minimum 1** ([settings docs](https://code.claude.com/docs/en/settings)). So a 90-day audit on a default install quietly reads 30 days, and next quarter's audit has no more history than this one.

As the last step of every run, after the fix list, read `~/.claude/settings.json` and report the retention window:

- **Key absent.** Say the default is 30 days, that every angle in this audit sharpens with a longer history, and offer the exact edit — `"cleanupPeriodDays": 180` in `~/.claude/settings.json` (`365` suits a heavy user who wants a year to mine). Name the cost in the same breath: transcripts are uncompressed JSONL, and a heavy user accumulates gigabytes a year. Apply it only when the user says yes.
- **Key present.** State the value in one line and move on.

Cross-check the setting against the data either way. Compare the `days` asked for against the age of the oldest row in `sessions.jsonl` (`min(start)`). When the oldest transcript is much younger than the window, the corpus is truncated — say so, because every total in the report then sits on a shorter denominator than the user assumes.

`reference/retention.md` holds the same facts for the other harnesses — which ones keep transcripts forever, which delete, where each stores them — for when the user asks whether their other agent is losing history too.

## Guardrails

- **Propose, then ask.** `CLAUDE.md`, `settings.json`, and `package.json` are user-owned and durable. Show the change and its number, offer to apply it, and edit the file only after an explicit yes to that change.
- **Absence of evidence is not evidence of absence.** This is one machine, one local history, possibly pruned or compacted. Report "I found no trace of X in the scanned window", never "you don't do X".
- **Check the fix is not already on disk.** Read the `projects` section and the repo before recommending a script, a rule, or a setting that already exists there; a duplicate rule is worse than none.
- **`durSec` is approximate and cost is estimated.** Say that once, near the first table that uses either, then state numbers plainly. Hedging every line makes the whole report unreadable.
- **The fact tables contain real prompts and real command output.** They land on disk at the work dir printed on the last stdout line. Redaction is best-effort and on by default. Tell the user where the files are and that deleting them is theirs to do.
- **Quote sparingly.** Short evidence lines only. The report is a fix list, not a transcript excerpt.

## Notes

- **Claude Code transcripts only in v1.** Codex rollouts (`~/.codex/sessions/**/rollout-*.jsonl`) carry a different line shape and are skipped. Say so when a user asks about a Codex session.
- **The nested-transcript trap is the one that ruins a corpus silently.** In the reference dataset 2,715 of 3,101 transcripts were nested workflow agents. A scan that finds only main sessions still prints a plausible-looking report.
- **Large corpora take minutes.** Thousands of transcripts and gigabytes of JSONL are normal; progress lines on stderr show where it is.
