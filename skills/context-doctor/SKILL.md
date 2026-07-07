---
name: context-doctor
description: "Audit and shrink the fixed context a coding agent auto-loads every session — tool/MCP definitions, plugins, skills, subagents, memory/rules files, built-in tools & feature subsystems — by pruning, gating, denying, or routing what's loaded but unused. User-invoked: type it when the context feels bloated."
disable-model-invocation: true
version: 1.2.0
---

# Context Doctor

Every session opens with a fixed tax paid before the user speaks: system prompt, tool definitions, MCP servers, plugins, skill descriptions, subagents, memory/rules files. Some is load-bearing; much is junk — unused in *this* repo yet shipped every turn, shrinking the window and feeding rot. This skill is the cleanup pass. Run it on "why is my context so full", token-budget triage, or after the user connects a pile of tools/MCP/skills.

**You are the instrument** — you can see your own loaded context. Read what you were actually given this session and cross-check it against real usage; don't guess what the harness injects.

---

## The surfaces

Split by who controls it:

- **Harness-injected** — system prompt, the core-loop scaffolding, provider attachments. Mostly unchangeable; account for it. But *less is truly fixed than it looks*: on the Anthropic harness many **built-in** tools and whole feature subsystems are now switch-off-able — see Fix G.
- **User-controlled** (your target):
  - **Tool definitions** — built-ins plus every MCP/connector tool. Usually the largest, most ignorable chunk. Built-in tools you never use in this repo (plan mode, notebooks, artifacts, cron, the ask-question UI…) can be denied by name.
  - **Feature subsystems** — bundled-skill catalogues, the multi-agent workflow engine, remote control, connectors. Each ships its own tool defs; many drop with a single flag.
  - **MCP servers** — project, user-level, and provider-synced "connectors" (enabled on a vendor site, synced down).
  - **Plugins** — bundle their own tools/skills/MCP.
  - **Skills** — each auto-loadable one spends its `name` + `description` every turn just to stay discoverable.
  - **Subagents** — each definition costs tokens.
  - **Memory & rules** — `CLAUDE.md` / `AGENTS.md` / memory indexes at every scope; always-on, paid every turn.

---

## Method

**1. Measure.** Inventory your own context, concretely:
- tools grouped by origin (built-in vs. each MCP server / connector / plugin); flag namespaces you never call here.
- skills + descriptions; auto-loaded vs. invoke-only.
- MCP servers and where each is configured.
- subagents and memory/rules in effect.

Read the harness's own breakdown first if it has one — the Anthropic harness's `/context` command reports tokens by category (system prompt, system tools, MCP tools, memory files, messages); for individual tool sizes a logging proxy that intercepts the API request and ranks each tool def is the deepest view. Rank by per-section token count when exposed, else by definition count — a server with 40 tool defs is a fat target.

**2. Correlate.** Bloat is *loaded but unused*. Look past this session:
- Scan past transcripts for the project (Claude Code: `~/.claude/projects/**/<uuid>.jsonl`; other agents store theirs elsewhere). What was ever actually invoked? Loaded in 100 sessions, called in zero is the cleanest cut.
- **A tool doesn't only leave its trace in transcripts — check for artifacts it persists on disk.** Some subsystems write durable run files that survive even when a transcript is summarized, truncated, or gone. The clearest example: the **workflow engine writes `wf_*.json` run files and a `scripts/` dir** under `~/.claude/projects/**/<uuid>/workflows/` every time it runs. Their presence is proof the user runs workflows — stronger than any transcript grep. Before proposing to disable *any* surface, look for its on-disk footprint too, not just message history:
  ```bash
  # Workflow usage — across ALL projects, not just this repo (a global flag reaches every project)
  find ~/.claude/projects -type d -name workflows 2>/dev/null | head
  find ~/.claude/projects -path '*/workflows/wf_*.json' 2>/dev/null | head
  ```
- **Absence of evidence is not evidence of absence — and it is never grounds for a confident "you don't use this."** You searched one machine's local history; the user may run the feature in projects you didn't scan, in sessions already pruned, or on another machine. When you find no usage, say exactly that — *"I found no trace of X in your local transcripts or run files"* — and let the user confirm before cutting. Reserve "you don't use it" for surfaces with a positive dead signal (e.g. a connector for a service with zero footprint in the repo). Never turn silence into an assertion.
- Cross-check the repo: a Supabase/Vercel/Notion connector in a repo with no trace of that service is dead weight.
- Note heavy skills or servers riding along in sessions whose task never touches them.

**3. Research.** For each cut, look up how this harness disables or scopes that surface today, and at which scope (global/project/local) — scope sets the blast radius.

**4. Propose.** Present a ranked table — *surface → est. saving → mechanism → scope → why safe*. For every change, **explain plainly what the mechanism does and what the user gives up** — the goal is an informed decision, not just a smaller number; the user may knowingly keep some bloat. For any blanket switch, **enumerate exactly what it turns off** (every connector, server, or skill) — never let the user approve a broad cut blind. Get approval, apply, re-measure.

---

## Fixes

### A. Prune MCP servers & connectors — the biggest win *if you don't use them*

Provider-synced connectors (enabled once on a vendor site, then present every session) are the classic offender — but plenty of people genuinely use them (Notion, Supabase, …), so this is never a safe default. Real before/after from this user:

```
Before: … WebFetch, WebSearch, mcp__claude_ai_Canva__* (×40),
  mcp__claude_ai_Gmail__*, mcp__claude_ai_Google_Drive__*, mcp__claude_ai_Miro__*,
  mcp__claude_ai_Notion__*, mcp__claude_ai_Supabase__* (×30), mcp__claude_ai_Vercel__* (×30),
  mcp__plugin_posthog_posthog__*, … mcp__ide__*, mcp__plugin_context7_*

After:  … WebFetch, WebSearch, mcp__executor__*, mcp__ide__*, mcp__plugin_context7_context7__*
```

Every `mcp__claude_ai_*` and the unused PostHog plugin gone: ~1,500 → ~100 tokens, every turn. Two shapes (confirm the current setting):

- **Kill switch** — one flag drops all synced connectors (e.g. `disableClaudeAiConnectors: true`). Before recommending it, **list every connector it will disable** so the user sees what they lose; only right when they use none here.
- **Per-server** — disable by name, keep the few you use. Usually better, since the switch is all-or-nothing.

Scope it: project vs. global changes what other repos see.

### B. Gate rarely-used skills behind explicit invocation

A skill useful *here* but irrelevant to most tasks still spends its description every turn. Make it invoke-only:

- **Claude Code:** `disable-model-invocation: true` in frontmatter (this skill uses it) — the skill stops auto-loading and runs **only** when the user types it explicitly.
- **Other harnesses** ignore the flag; instead move the skill off the auto-discovered path so it's read only on request.

Both mechanisms make the skill *user-invoke-only* — the harness can no longer load it on the model's behalf, so an auto-trigger and a rules-file pointer alike stop being able to pull it in (see the gate/pointer guardrail before pairing a gate with a rules-file mention).

**First check the skill earns its keep as invoke-only.** Some skills are *meant* to trigger exactly when relevant, and a good `description` + auto-trigger already delivers "loads when relevant, quiet otherwise." Only gate skills genuinely rarely relevant to this repo's work.

Suggest gating (or relocation), never apply silently — and spell out the consequence: after the flag the skill no longer surfaces on its own, so any value it got from auto-triggering on file context is gone and the user must remember to invoke it.

### C. Route monolithic skills

A skill that inlines a big doc forces the whole payload in whenever it loads, even for tasks touching none of it. Refactor to a **router** — a tiny dispatch table, with heavy content in sibling files read on demand:

```md
# Database toolkit (router)
- Running a migration?   → read ./migrations.md
- Writing a seed?        → read ./seeds.md
- Debugging a slow query? → read ./query-perf.md
```

A force-loaded router costs only the table. Harness-agnostic — recommend it for any large always-loaded skill with conditional content.

### D. Delete what's dead

Unused skills, orphaned subagents, stale MCP entries — if history shows zero use and the repo gives no reason to keep them, propose deletion. **Exception:** a skill or rule mirrored across `.claude` and `.agents` is not a dupe to collapse — see the dual-home guardrail.

### E. Trim always-on memory & rules

`CLAUDE.md` / `AGENTS.md` / memory indexes load every turn. Flag content that's stale or redundant *within the same scope* — but a global-vs-project duplicate is usually intentional reach, not waste (see the scope guardrail). Past a memory index's budget cliff it's invisible anyway — pure cost.

**Better than trimming: turn conditional rules into a skill.** When a block of an always-on rules file is really task-specific — e.g. a global "how to scaffold a new project" guide loaded in *every* repo but relevant only when starting one — lift it into a skill. The body leaves context; only its one-line description stays, loading when the task calls for it. The trade: no longer guaranteed present, so surface that and let the user choose. (Same move for router-shaped content → C, or directory-specific rules → F.)

**Watch for `@import` / inline includes that force conditional content always-on.** A rules-file line like `@.agents/skills/quality-code/SKILL.md` pastes that file's *entire body* into context every turn — same cost as inlining it. If the content is conditional (e.g. TypeScript coding standards, useless during a pure-docs task) that whole body is bloat, and if the file is *also* a registered skill it's loaded twice.

The fix: **downgrade the heavy import to a light pointer — keep the mention, drop the body.** Replace the `@import` with a one-line "for coding, follow the `quality-code` skill" note. That preserves what the user wanted the import for — *emphasis*: a rules-file line explicitly saying "load this when you do X" makes the model far likelier to pull that skill than if it were one of 20 in the list — while the body now loads on demand instead of every turn. (Works **only** while the skill stays auto-loadable — see the gate/pointer guardrail.) Do **not** silently delete the mention: people import a skill precisely because it's the important one they want highlighted, they just don't want its full text always-on.

Two things to keep straight: **don't delete the target file** (the skill still needs it), and know you're removing the *import line*, not the skill.

### F. Scope rules with nested memory

The root rules file is the worst home for *conditional* guidance — "how to run a migration", "how to add a UI component" — paid every turn including the 90% that never touch that area. Most harnesses load **nested memory on demand**: a `CLAUDE.md` / `AGENTS.md` in a subdirectory enters context only when the agent touches that subtree. So the fix is usually **relocation, not deletion**:

```
Before:                          After:
CLAUDE.md  (always loaded)       CLAUDE.md            ← cross-cutting rules only
  # DB migrations …  (30 lines)  packages/database/CLAUDE.md   ← loads on DB work
  # UI components …  (25 lines)  packages/ui/CLAUDE.md         ← loads on UI work
```

Content survives and arrives exactly when relevant; unrelated turns stop paying. Confirm the trigger and file name per agent.

### G. Disable built-in tools & feature subsystems you don't use

Fixes A–F trim what *you* added. But a large, ignorable chunk is first-party — built-in tools and whole subsystems shipped every turn whether this repo needs them or not. On the **Anthropic harness** two `settings.json` mechanisms (global `~/.claude/`, project `.claude/`) turn them off.

> **Harness-specific — this is the Anthropic Claude Code shape only.** The keys below don't exist on Codex, OpenCode, Pi, or others. Treat them as a worked example of the *idea* — "find the config that drops unused built-in tooling" — and, for any other agent, research that agent's own docs for its equivalent before recommending anything. (Codex, for instance, configures tools differently and has no `permissions.deny`/`disable*` flags.)

**G1 — Feature flags: one key drops a whole subsystem.**

| Flag | Drops | What the user gives up |
|---|---|---|
| `disableWorkflows` | the `Workflow` multi-agent tool — often the single largest tool definition in the payload | multi-agent orchestration / "ultracode" runs. **Before proposing this, check the on-disk footprint (Method step 2): `find ~/.claude/projects -type d -name workflows`. If `wf_*.json` run files exist, the user runs workflows — do not recommend disabling it.** |
| `disableBundledSkills` | Anthropic's bundled skill catalogue (`dataviz`, `review`, `init`, …) from the model's payload | the model auto-loading them — but their **slash commands stay typable**, so `/init` etc. still work by hand |
| `disableArtifact` | the `Artifact` tool | publishing HTML/Markdown artifact pages |
| `disableRemoteControl` | remote-control / push tooling | driving the session remotely |
| `disableClaudeAiConnectors` | *all* provider-synced connectors at once | every connector — same kill switch as Fix A; **list them before flipping it** |

**G2 — Deny built-in tools by name.** `permissions.deny: ["EnterPlanMode", "AskUserQuestion", …]` strips each named tool's definition from every turn. Name the high-consequence ones out loud so the user decides with eyes open — several change the *UI*, not just the token count:

- `EnterPlanMode` + `ExitPlanMode` → **removes plan mode entirely.** Shift-Tab plan mode stops working. Keep both if the user ever plans before editing.
- `AskUserQuestion` → **removes the multiple-choice question UI.** The model can no longer pop option chips to disambiguate; it falls back to asking in plain prose — or to guessing instead of asking. Real UX loss, not free.
- `NotebookEdit` → no Jupyter `.ipynb` editing. Safe to drop in a repo with no notebooks.
- `CronCreate` / `CronDelete` / `CronList`, `ScheduleWakeup` → no scheduled or self-paced recurring agents (`/schedule`, `/loop`).
- `SendMessage`, `PushNotification`, `RemoteTrigger`, `DesignSync`, `ReportFindings` → inter-agent messaging, notifications, and review plumbing — deny whatever this workflow never triggers.

**G3 — `skillOverrides`: gate a skill from settings, not frontmatter.** `skillOverrides: { "some-skill": "off" }` removes a skill from the payload entirely; `"user-invocable-only"` keeps its slash command typable but hides it from the model. This is the Fix-B gate applied from *settings* — so it works on bundled and plugin skills whose frontmatter you don't own.

**Don't strip the machinery your own workflow rides on.** Background jobs and multi-agent runs depend on the Task tools, `Workflow`, and the worktree tools; scheduled/recurring agents depend on the cron tools. If the user runs `/loop`, scheduled agents, or workflows, *keep* those — the definition cost buys a feature they actually use. Some of what looks like bloat is load-bearing machinery.

Illustrative combined cut (confirm each key still exists, and that the user uses none of what it removes):

```json
{
  "permissions": {
    "deny": ["EnterPlanMode", "ExitPlanMode", "NotebookEdit",
             "AskUserQuestion", "CronCreate", "CronDelete", "CronList",
             "ScheduleWakeup", "SendMessage", "PushNotification",
             "RemoteTrigger", "DesignSync", "ReportFindings"]
  },
  "disableBundledSkills": true,
  "disableWorkflows": true,
  "disableRemoteControl": true,
  "disableClaudeAiConnectors": true,
  "disableArtifact": true
}
```

Re-measure with `/context` afterward — a full strip like this recovers tens of thousands of tokens per turn. But **every line above is a behavior change, not just a smaller number**: present each with its consequence and let the user opt in *per item*. Many will knowingly keep plan mode, the question UI, artifacts, or workflows — that's the informed decision, not a failure to cut.

---

## Guardrails

- **Treat every flag, path, and setting name here as illustrative, not current.** Harnesses rename and relocate them across versions, and other agents (Codex, OpenCode, Pi, …) use different mechanisms entirely. Confirm today's mechanism in the agent's own docs before telling the user to edit anything.
- **Propose, don't apply — config edits are durable and user-owned.** Show the cut and its saving, then ask. Killing something load-bearing is worse than the bloat, and a context too small to do the job is no win.
- **Treat a `.claude` + `.agents` dual-home as intentional cross-harness support; leave both.** `.claude` / `CLAUDE.md` is read by Anthropic's harness; `.agents` / `AGENTS.md` is the open standard every other agent reads. Skills and rules mirrored across both — duplicated or symlinked — let each harness see its own home; collapsing to one silently blinds the other. Treat the mirror as intentional unless told otherwise.
- **Follow the reference chain before proposing a cut.** An `@import`/include, a skill, and a symlink all point at a real file; deleting the file breaks every pointer to it. Know whether you're removing the *pointer* (import line) or the *target* (file), and change one while leaving the other intact.
- **Gate a skill *or* keep a rules-file pointer to it — never both.** Gating (`disable-model-invocation`, or moving it off the auto-discovered path) makes a skill *user-invoke-only*: the model can't load it on its own, so a rules pointer to it becomes dead weight rather than a fallback. If the agent should still pull the skill on coding tasks, keep it auto-loadable and keep the pointer. If it should fire only when typed, gate it and say plainly the pointer no longer summons it.
- **Judge scope by reach, not just cost — this repo isn't the only place the user works.** A *global* surface is the fallback for every other project on the machine (and any sub-agent spawned anywhere); a *project* surface is checked in to share with teammates who may lack your global config. So a global-vs-project duplicate is usually deliberate: keep the *global* copy (in a repo with no project pointer it's the only thing auto-loading that skill) and keep the *project* copy (dropping it breaks team sharing). Collapse redundancy only when it's provably wasteful at the *same* reach — e.g. an `@import` body stacked on the description in this one repo. Judge a global cut by every repo it touches, not this session, and prefer narrow scope (project/local) for new cuts unless the user wants them everywhere.

---

Now run the analysis on this session. Produce a **comprehensive, ranked menu** of ways to prune the context — across MCP/connectors (A), skills (B, C), dead weight (D), memory/rules (E, F), and built-in tools & feature subsystems (G) — each row stating its estimated per-turn saving, its exact mechanism at a stated scope, and *plainly what the user gives up*. Cover the built-in-tool and feature-flag cuts explicitly; they are usually the largest untapped win and the most ignored. Then let the user decide per item — the goal is a leaner, more focused agent the user chose, not the smallest possible number.
