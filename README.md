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

| Skill | Description |
| --- | --- |
| [`parallel-worktree-orchestrator`](skills/parallel-worktree-orchestrator/SKILL.md) | Use the root conversation as an orchestrator that fans out independent workstreams to worktree-isolated subagents and reviews their output. |
| [`session-report`](skills/session-report/SKILL.md) | `/session-report <id>` — generate a self-contained HTML report debugging a Claude Code (or Codex) session's context window: token budget, thinking cost, dumb-zone cutoff, full history. |

## Adding a new skill

1. `mkdir skills/<name> && cd skills/<name>`
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

3. Add a row to the table above.
4. Commit and push.

## License

MIT
