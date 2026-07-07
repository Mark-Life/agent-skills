---
name: parallel-worktree-orchestrator
description: Use when the user provides a plan file or describes multiple independent workstreams to implement in parallel, and wants the root conversation to act as an orchestrator that fans out work to isolated subagents. Triggers on phrases like "implement these in parallel", "spawn subagents for each", "orchestrate this plan", "split this work across agents", or any task where the plan has 2+ independent pieces that can be built concurrently.
version: 1.0.0
---

# Parallel Worktree Orchestrator

Pattern for using the root Claude Code conversation as an orchestrator that spawns worktree-isolated subagents to implement independent pieces of a plan in parallel, then reviews their output.

## When to use

- Plan file or message describes 2+ workstreams that don't share files / can be built independently
- User wants parallel execution, not sequential
- User wants the parent agent to review subagent output before merging

Skip this skill for: single-file changes, sequential tasks, refactors that touch shared code, anything where one piece blocks another.

## Core mechanism

Claude Code's `Task` / `Agent` tool supports `isolation: "worktree"`. When set:

- Harness creates a git worktree at `.claude/worktrees/<name>/`
- Worktree gets a fresh branch `worktree-<name>`
- Subagent runs with that worktree as cwd
- On completion: auto-cleaned if no changes; otherwise path + branch returned to parent

Multiple `Agent` tool calls in a single parent message run in parallel, each in its own worktree. No file collisions.

Docs:
- `common-workflows.md#subagent-worktrees`
- `subagents-and-plugins.md`

## Orchestrator workflow

1. **Read the plan.** Parse workstreams. Confirm to user which ones will run in parallel and which (if any) must be sequential due to shared files.

2. **Pre-flight checks** (do once before fanning out):
   - Repo is git-initialized and on a clean working tree (or user has approved running with dirty tree).
   - `.worktreeinclude` exists if subagents will need gitignored files (`.env`, `.env.local`, etc). If not, create one or warn the user.
   - Identify port conflicts upfront: if subagents will run dev servers, assign a distinct port per workstream in each prompt.

3. **Fan out.** In a single parent message, emit one `Agent` tool call per workstream with `isolation: "worktree"`. Each prompt must be self-contained:
   - Workstream spec (extracted from plan)
   - Definition of done
   - Files / directories the subagent owns
   - Files it must NOT touch (anything owned by sibling workstreams)
   - Assigned port if running a server
   - Instruction: "Return a summary listing files changed and any decisions made"

4. **Wait for all subagents to return.** Each returns a summary + worktree path + branch name (when changes exist).

5. **Review pass.** For each subagent's worktree:
   - Read changed files directly from `.claude/worktrees/<name>/`
   - Or `git diff main...worktree-<name>` from main checkout
   - Verify acceptance criteria from the plan
   - Run lint/typecheck/tests scoped to changed files if available

6. **Report.** Single message back to user: per-workstream status (done / needs-fixup / blocked), any cross-cutting issues discovered, and the list of branches ready to merge.

## Gotchas

- **No nested subagents.** Spawned subagents cannot themselves spawn subagents. Plan all fan-out at the parent level.
- **Gitignored files don't copy.** Add a `.worktreeinclude` listing patterns (e.g. `.env*`, `.env.local`).
- **node_modules**: each fresh worktree may need its own install. Prefer pnpm/bun shared store, or have subagents skip install if not needed.
- **Port collisions**: assign explicit ports per subagent (3001, 3002, ...) in their prompts.
- **Shared files = sequential, not parallel.** If two workstreams both touch `package.json` or a shared config, run them sequentially or merge manually.
- **Parent reviews from worktree paths**, not from main checkout. Read files at `.claude/worktrees/<name>/<file>`.
- **Custom subagent definitions** can hard-code `isolation: worktree` in `.claude/agents/<name>.md` frontmatter — useful when this is a recurring pattern in a repo.

## Defining a reusable implementer subagent (optional)

If the user wants this pattern repeatable in their repo, create `.claude/agents/implementer.md`:

```markdown
---
name: implementer
description: Implements a single workstream from a larger plan. Receives a self-contained spec; produces code in an isolated worktree.
isolation: worktree
---

You receive a workstream spec describing files to create/edit, acceptance criteria, and constraints (files not to touch, ports to use). Implement only what the spec asks for. Do not refactor surrounding code. Return a summary listing: files changed, any decisions made, anything that blocked you.
```

Then orchestrator just spawns `implementer` subagents with per-workstream prompts.

## Alternative: Agent Teams

If subagents need to coordinate with each other (shared task lists, inter-agent messaging) rather than pure fan-out/fan-in, use Agent Teams instead. Enable with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. More token-heavy. Overkill for independent-workstream plans — stick with worktree subagents.

## Anti-patterns

- Spawning subagents sequentially when they could be parallel — defeats the point.
- Spawning subagents on overlapping file sets — causes merge pain. Re-scope the plan first.
- Letting subagents merge their own branches — orchestrator (or user) reviews and merges.
- Skipping the review pass — the parent's job is verification, not just dispatch.
