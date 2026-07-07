# agent-skills

Personal collection of agent skills, installable via the [`skills` CLI](https://github.com/vercel-labs/skills).

## Install

```bash
# List available skills
npx skills add Mark-Life/agent-skills --list

# Install all skills for Claude Code
npx skills add Mark-Life/agent-skills -a claude-code

# Install a specific skill
npx skills add Mark-Life/agent-skills --skill session-report

# Update later
npx skills update
```

Pin to a tag/branch:

```bash
npx skills add https://github.com/Mark-Life/agent-skills/tree/v1.0.0
```

## Skills

Skills are grouped into catalog folders under `skills/<group>/`.

### Coding Workflows

| Skill | Description |
| --- | --- |
| [`new-project`](skills/coding-workflows/new-project/SKILL.md) | Scaffold a brand-new project from the personal Next.js monorepo template (`Mark-Life/netxjs-monorepo`) and run the standard bootstrap. |
| [`parallel-worktree-orchestrator`](skills/coding-workflows/parallel-worktree-orchestrator/SKILL.md) | Use the root conversation as an orchestrator that fans out independent workstreams to worktree-isolated subagents and reviews their output. |

### Inspect & Debug

| Skill | Description |
| --- | --- |
| [`session-report`](skills/inspect-and-debug/session-report/SKILL.md) | `/session-report <id>` — generate a self-contained HTML report debugging a Claude Code (or Codex) session's context window: token budget, thinking cost, dumb-zone cutoff, full history. |
| [`memory-view`](skills/inspect-and-debug/memory-view/SKILL.md) | `/memory-view [project]` — open a self-contained, secret-redacted HTML explorer of Claude Code's per-project auto-memory. View, search, and browse only — no edits, no curation. |
| [`context-doctor`](skills/inspect-and-debug/context-doctor/SKILL.md) | `/context-doctor` — audit and shrink the fixed context loaded every session (tool/MCP definitions, plugins, skills, subagents, memory/rules) by pruning, gating, or routing what's loaded but unused. |

## Repository layout

```
skills/<group>/<name>/  # SHIPPED. `skills add` copies the whole skill folder to the user.
tests/<name>/           # NOT shipped. Unit tests + fixtures.
tests/guard.test.ts     # CI guard: skills/ must hold only runtime artifacts.
skills.sh.json          # display grouping on skills.sh (no effect on the CLI)
```

Skills live in catalog layout (`skills/<group>/<name>/SKILL.md`). The `skills`
CLI resolves `--skill <name>` by the `name` field in frontmatter, not by path,
so the grouping folders don't affect installs.

`npx skills add` copies a skill's **entire** folder to the end user (it only
strips `.git`, `__pycache__`, `__pypackages__`, `metadata.json`). So tests,
fixtures, and dev tooling must live in `tests/`, never inside `skills/<name>/`.
See [`CLAUDE.md`](CLAUDE.md) for the full convention.

```bash
bun test        # run unit + guard tests
```

## Adding a new skill

1. `mkdir -p skills/<group>/<name> && cd skills/<group>/<name>`
2. Create `SKILL.md` with frontmatter:

   ```markdown
   ---
   name: <name>
   description: One sentence describing when the agent should use this skill.
   version: 1.0.0
   ---

   # <Name>

   Instructions for the agent.
   ```

3. Keep the folder lean — runtime files only. Put tests and fixtures in
   `tests/<name>/`, not in the skill folder.
4. Add a row to the table above (under the matching group) and list it in `skills.sh.json`.
5. Commit and push.

## License

MIT
