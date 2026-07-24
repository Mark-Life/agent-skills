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
| [`product`](skills/coding-workflows/product/SKILL.md) | Product taste for shaping what to build, grown one principle at a time. Currently: *boil the ocean* (scope the ambition to what agents made possible), *the primitive is the product* (name the capability others compose on; schema, errors and guarantees are the surface), *the work announces itself* (start from a signal, not a prompt; reversibility draws the autonomy boundary), and *grow a second nervous system* (declare capabilities for machines, discover them lazily, and expose a core beneath the experience — agents are how humans find you). |
| [`new-project`](skills/coding-workflows/new-project/SKILL.md) | Scaffold a brand-new project from the personal Next.js monorepo template (`Mark-Life/netxjs-monorepo`) and run the standard bootstrap. |
| [`observability`](skills/coding-workflows/observability/SKILL.md) | Instrument a TypeScript service so production is answerable: one wide event per request, job or run, high-cardinality fields, closed outcome unions, two-tier span names, bounded metric tags, config-gated OTel export, and tail sampling. Owns logging, tracing and metrics decisions. |
| [`pr-issue`](skills/coding-workflows/pr-issue/SKILL.md) | Write PR, issue, and ticket titles and bodies in Vim's `area: summary` style — `Problem:`/`Solution:`/`Security Impact:`/`Testing:` for PRs, `Problem:`/`Reproduction:`/`Expected vs actual:`/`Proposed solution:` for issues. |

### Communication

| Skill | Description |
| --- | --- |
| [`agent-to-human`](skills/communication/agent-to-human/SKILL.md) | Write the final human-facing output — chat reply, summary, status update, PR/issue/commit message — to respect the reader's attention: answer first, cut to the decision, receipts only, plain words. Source of truth for output style. |
| [`human-to-agent`](skills/communication/human-to-agent/SKILL.md) | Write instructions an agent will execute — prompts, skills, `CLAUDE.md`/`AGENTS.md` rules, tickets — for predictable behaviour: prompt the positive, leading words, cut no-ops, checkable completion criteria. |

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

## Credits

- [`product`](skills/coding-workflows/product/SKILL.md) — most of its principles
  are distilled from other people's writing; each sourced one is credited in
  [`skills/coding-workflows/product/README.md`](skills/coding-workflows/product/README.md).
- [`pr-issue`](skills/coding-workflows/pr-issue/SKILL.md) — the Vim-style
  `area: summary` commit/PR format (`Problem` / `Solution` / `Security Impact` /
  `Testing`) comes from **[Fatih Arslan](https://arslan.io)**
  ([@fatih](https://github.com/fatih)), shared on X.
- [`human-to-agent`](skills/communication/human-to-agent/SKILL.md) — its
  principles and vocabulary (leading words, no-ops, single source of truth,
  sediment, sprawl) draw from **[Matt Pocock](https://github.com/mattpocock)**'s
  [`writing-great-skills`](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-great-skills)
  skill.

## License

MIT
