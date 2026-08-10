# Analysis angles

Seven angles over the five fact tables. Each one says what to compute, what a finding looks like when it is good enough to ship, and the trap that angle carries.

The example findings are drawn from a reference audit of one user's 60 days: 3,101 sessions, 70,261 tool calls, 38,026 of them Bash, 24.5h of Bash wall-time, 10.0B cache-read tokens. **They are examples of shape, not results.** Recompute every number against the current corpus before it appears in a report.

Field names and section names below are documented in `stats.md`.

---

## 1. Bash economics

**Compute** from `bash.jsonl` and the `commands` section. Group by `family` and rank by `totalSec`, then again by `count`: the two rankings disagree, and the disagreement is the finding. Carry `medianSec`, `p95Sec`, and `errRate` per family. Then three derived views: `repeatsInSession` (identical `cmd` re-run inside one session), `flagFlailing` (same `bin`, four or more distinct normalised commands inside ten minutes), and foreground long-runners (high `medianSec` with `bg: false`).

**Good findings.**

- `bun run typecheck` ran 412 times, 3.9h of wall-clock, median 34s. Make it incremental: `"typecheck": "tsc -b --incremental"` in `package.json`, plus `*.tsbuildinfo` in `.gitignore`. Median drops to the changed-file set.
- `bun run build` ran 41 times, median 96s, every one in the foreground. Add to `CLAUDE.md`: "run `bun run build` with `run_in_background: true` and poll." Recovers about 65 minutes of blocked wall-clock.
- `ffmpeg` was called with 7 different flag sets inside 4 minutes in 11 separate sessions. The seventh worked each time. Pin it in `CLAUDE.md` as one exact invocation.
- The same `git status` ran 6 times inside one session, 34 times across the window. One `CLAUDE.md` line: "read the output you already have before re-running a read-only command."

**Trap.** `durSec` is call-to-result and includes harness overhead and any wait for the user to approve a permission prompt. A fast command gated behind an approval prompt looks slow. Before calling a family slow, run it once by hand and compare against `medianSec`; when the gap is large the fix is a `permissions.allow` entry, not a faster command. Second trap: `totalSec` summed across a 30-day window is not time the user sat waiting, because background and parallel calls overlap. Say "total tool seconds", not "hours lost".

---

## 2. Errors and environment gaps

**Compute** from `errors.jsonl` and the errored rows of `bash.jsonl`, plus the `errors` section. Cluster by `sig` and carry `count`, `sessionCount`, `projects`, `sampleMsg`, `topTool`. Then `missingBinaries` (command-not-found and ENOENT targets), `permissionDenied`, and `retryLoops` (same normalised command re-run within 5 minutes of an error).

**Good findings.**

- Bare `echo ===` aborted 67 command chains under `zsh` (`zsh: no matches found`), each one losing the rest of its `&&` chain. `CLAUDE.md`: "quote shell separators: `echo '==='`, never bare `echo ===`."
- `jq: command not found` in 23 sessions across 5 projects. Either `brew install jq` once, or a rule that says parse JSON with `node -e` so the corpus stops depending on it.
- `EACCES` on `.next/` 12 times in one repo, all after a `sudo`-built artifact. One `chown -R "$USER" .next` and the cluster ends.
- `gh pr create` retried a median of 4 times after an auth error in 9 sessions. `gh auth login` once, plus a `CLAUDE.md` line pointing at it when a `gh` call returns 401.

**Trap.** `sig` masks paths, numbers, hashes, and quoted strings, so two unrelated causes can land in one cluster. Read `sampleMsg` and at least two raw rows before naming a cause. Second trap: `missingBinaries` mixes binaries the shell could not find with ENOENT *file* targets under the same `bin` key — a top row reading `content/courses/.../01-set-up.mdx` is a Python `FileNotFoundError`, not a missing binary. Read `sampleMsg` and drop rows whose `bin` holds a `/` or a file extension before recommending an install. Third trap: separate "once per session across 300 sessions" from "300 times in one session" using `sessionCount`, not `count`. The first is an environment gap and a rule fixes it; the second is one bad loop and only that session needs anything.

---

## 3. Context and token economics

**Compute** from `sessions.jsonl` and `tools.jsonl`, plus the `tokens` and `context` sections. Rank sessions by `maxCtx` and by `cacheReadTokens`, and state the concentration: what share of the total the top slice holds. Then `bigOutputs` (tool calls by `outChars`, with the p95 per tool), `reReads` (same `arg` Read more than once in a session), and `cacheWriteRatio` by `kind`.

**Good findings.**

- 39 of 327 main sessions held 76.4% of all main-session cache-read tokens. The fix targets those 39, not the average session: name what they have in common (long single sessions in one repo, full-test-suite output, whole-file rereads) and fix that.
- `Bash` output is p95 61K chars, driven by `bun test` printing every passing test. `"test": "bun test --reporter=dot"` in `package.json` cuts the p95 by roughly 90% with no loss of failure detail.
- The same file was Read 5 times in one session, about 12K tokens re-paid. `CLAUDE.md`: "read a file once per session; re-read only after you edit it."
- Workflow agents wrote 3.2x more cache than they read back. The prefix is being cached and discarded: see angle 5.

**Trap.** Cache reads are the cheapest tokens there are (1.50 vs 15 USD per million on the opus family), so a ranking by raw token count over-weights them and points at the wrong sessions. Rank by estimated cost as well, and say which ranking a claim came from. Second trap: a large `maxCtx` often marks the session that did the real work. Size is not waste. Look for repeated identical content — the same file, the same output, the same prefix — not for big numbers.

---

## 4. Human friction

**Compute** from `user-msgs.jsonl` filtered to `human: true`, plus the `human` section and `interrupts` from `sessions.jsonl`. Bucket correction signals and count them, keeping 2-3 verbatim samples per bucket. Then `repeatedRequests`: near-duplicate human turns clustered across different sessions, which is the strongest signal in the whole audit, because the user typing the same instruction twice means a durable rule is missing.

**Good findings.**

- "use bun, not npm" appeared in 9 sessions across 4 repos. One line in global `CLAUDE.md`: "package manager is bun: `bun install`, `bun run <script>`, never npm or pnpm."
- 31 interrupts across 12 sessions, 27 of them during a `Bash` call whose `durSec` was over 60s. Same fix as the foreground long-runners in angle 1.
- "don't add comments explaining what the code does" 6 times in 5 sessions. Add it to the repo's `CLAUDE.md` next to the existing style rules, where the existing rules already are.

**Trap.** This is the angle that fabricates results if you let it. A naive keyword scan in the reference audit reported 41 complaints where 24 were real: the rest were harness-generated turns and the skill's own instruction text echoing back through transcripts. Filter to `human: true` (SKILL.md, *Verify before you report*), then read every sample in a bucket before trusting its count: a bucket matched a phrase, it did not read the turn. Second trap: the same correction repeated three times inside one session is one frustration, not three. Cluster by session, then count sessions.

---

## 5. Workflow and subagent efficiency

**Compute** from `sessions.jsonl` where `kind` is `workflow-agent` or `subagent`, plus the `fanout` section. Group by `run` and rank runs by estimated cost, carrying agent count, tokens, and median `firstTurnCacheCreate`. Cross `models` against what each agent produced: `outTokens` in the bottom decile relative to `cacheReadTokens` is the `lowYield` set. A lookup step on a frontier model is the classic finding.

**Good findings.**

- 695 workflow agents did lookup only — read a file, return a value — on the opus family, median 1,400 output tokens each. Route that step to the sonnet family in the workflow definition: same output, roughly a fifth of the cost.
- One fan-out re-attached a shared 44K-token prefix to each of 281 sibling agents as fresh cache-create. Hoist the brief into one parent read and pass each sibling a pointer plus its own slice.
- 12 agents in one run each read over 180K tokens and returned under 400. They were searching a corpus the parent had already searched. Have the parent pass the result, not the corpus.

**Trap.** A cheaper model is not free: it fails differently, and the retry costs more than the saving. Propose a model swap only for steps whose output is a lookup or an extraction, and name those steps explicitly rather than saying "route simple agents to sonnet". Second trap: a high `firstTurnCacheCreate` across a run can be an unavoidable cold cache, not a duplicated prefix. It is duplication only when siblings started close together in time all pay a similar prefix — check the timestamps before you call it waste.

---

## 6. Per-repo setup gaps

**Compute** from the `projects` section: per project sessions, tokens, `bashSec`, top commands, and what exists on disk at `cwd` — `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `package.json` (package manager and script names only). The finding is the mismatch between what a repo costs and what it configures.

**Good findings.**

- The repo with the most Bash seconds (4.1h) has no `CLAUDE.md`, and its top three commands are `pnpm ...` while the global rule says bun. Add a project `CLAUDE.md` naming the package manager and the three commands.
- 8 of 11 projects have `.claude/settings.json`; the two with the highest `bashSec` do not. Copy the same `permissions.allow` list into both so routine commands stop waiting for approval.
- One repo's `package.json` has no `typecheck` script, and the transcripts show `npx tsc --noEmit -p tsconfig.json` typed out 47 times with three different flag sets. Add `"typecheck": "tsc --noEmit"` and reference it in `CLAUDE.md`.

**Trap.** Check what is already there before proposing it. A rule that exists and is ignored needs a different fix — make it specific, move it where it loads — than a rule that is missing. Second trap: the project dir name is encoded, so resolve it to `cwd` before reading disk, and when `cwd` no longer exists, skip the project instead of reporting it as unconfigured.

---

## 7. Web research

**Compute** from `tools.jsonl` where `tool` is `WebFetch` or `WebSearch`, plus the `web` section. Count calls, seconds, and chars, then `repeats` keyed on `arg` (the url or the query), splitting repeats that fall inside one run from those spread across sessions. Rank by concentration per `run`: a fan-out where every sibling searches the same thing is the cheapest fix in the whole audit.

**Good findings.**

- 8,177 web calls, 12.5h of tool time, and 25.2% of them re-fetched a url or a query already answered elsewhere in the window. Naming the top 10 repeated urls is the fix list.
- `docs.stripe.com/api/refunds` was fetched 34 times across 19 sessions. Vendor the page into `docs/stripe-refunds.md` and point `CLAUDE.md` at it, or add a docs MCP that caches.
- 9 sibling agents in one run each ran the same search query. Have the parent search once and pass the text down: 8 calls and about 6 minutes back, per run of that shape.

**Trap.** A repeat is not automatically waste. A status page, a CI run, a changelog is meant to be re-fetched, and the same url fetched three weeks apart is a cold cache, not a mistake. Split repeats by time gap and by whether they sit inside one run, and only call the tight ones waste. Second trap: `outChars` for a web fetch measures what the tool returned, not what the model needed — a long page read once is fine, and the target is the same page read many times.
