---
name: memory-view
description: A viewer for Claude Code's per-project auto-memory. A zero-dep TypeScript script scans ~/.claude/projects/<project>/memory/, renders a self-contained, secret-redacted HTML explorer, and opens it in the browser. No model curation, no edits, no findings — the model only runs the script and opens the report. Local, human-facing, never auto-fired.
when_to_use: "Run `/memory-view` to open a cross-project explorer of everything Claude remembers on this machine (default), or `/memory-view [project]` to open the report for one project. Use when you want to browse, search, or eyeball your memory — e.g. \"show me my Claude memory\", \"what does Claude remember\", \"open the memory viewer\", \"see memories for my-work\". This skill renders and opens HTML only; it does not audit, edit, or curate."
argument-hint: "[project]"
arguments: project
disable-model-invocation: true
version: 2.0.0
---

# Memory View

A **viewer** for Claude Code's per-project auto-memory. This skill is a thin wrapper around a deterministic, zero-dependency TypeScript script: the script reads the memory vault, renders a single self-contained HTML explorer, and opens it in the browser. **That is the whole job.**

The model's only role is to **run the script and open the report**. It does **not** read, audit, edit, merge, split, delete, or otherwise curate memory. The HTML is a local, secret-redacted, human-facing artifact — same lineage and posture as `session-report`.

This is a **user-invoked** command (`/memory-view`); it is never auto-invoked. The optional project is passed as `$project`.

## What it operates on

- Memory lives at `~/.claude/projects/<slug>/memory/`, where `<slug>` is the project's git-root path with `/` and `.` both replaced by `-`. There is **no global store** — most projects have no memory dir, which is normal, not an error.
- `MEMORY.md` is the always-loaded index (budget: first **200 lines or 25 KB**, whichever comes first). Topic files are markdown + YAML frontmatter (`name`, `description`, `type` ∈ user/feedback/project/reference), with bodies cross-linked via `[[wikilinks]]`.

## How to run

Zero-dependency TypeScript, **no build step**. Run from the skill's `scripts/` dir. Detect the runtime (`command -v node bun`) — the user needs only one. **Always pass `--open`** so the report opens in the browser.

```bash
# DEFAULT — no project given: cross-project explorer, every memory grouped by project:
node   scan-memory.ts --open
bun run scan-memory.ts --open
npx tsx scan-memory.ts --open        # older Node without native type-stripping

# A specific project — single-project report:
node scan-memory.ts my-work --open   # bare name ⇒ single-project view
node scan-memory.ts --view --open    # current project (resolved from cwd git root)
```

The single `stdout` line is the HTML path; stats and warnings go to `stderr`.

## Picking the project

- **No project mentioned → run the default** (`--open`, no positional): the all-projects explorer. This is the `/memory-view` case.
- **User names a project** (e.g. "show me memories for my-work") → pass it as a bare positional: `node scan-memory.ts my-work --open`. The script resolves it by matching the name against known project slugs (suffix match first, then substring), so a short name like `my-work` is enough. It also accepts an encoded slug, a project path, or a memory-dir path.
- **User means "this project" / the current repo** → use `--view` with no positional; the script resolves from the cwd's git root.
- If the resolved project has no memory (absent / empty / index-only), the script prints a short notice and lists the projects that *do* have memory — relay that so the user can pivot.

## What the explorer shows

- **MEMORY.md budget gauge** — fill vs the 200-line / 25 KB cliff, with below-the-fold entries greyed and marked **"INVISIBLE TO CLAUDE"**.
- **Type donut** (user/feedback/project/reference) and quick stats.
- **Browse table** — one row per memory: title · type · description · size · modified · in-index? · links. Sortable/filterable/searchable; click a row to expand it inline into full detail (frontmatter, body + raw toggle, clickable links).
- **Index-vs-files diff** — orphan files (on disk, not indexed) vs dangling entries (indexed, no file).
- **Link graph** (arc view) of resolved body links between memories.
- In the **default** scope, a sortable project overview sits on top, then every memory on the machine in a per-project accordion; search and type-filter span all projects.

## Notes

- **Privacy boundary:** the HTML embeds memory bodies, so best-effort secret redaction is **ON by default** (`--no-redact` turns it off) to protect the shareable artifact. The report opens with a dismissible "review before sharing" banner and a `stderr` WARNING prints either way. The script is the only thing that reads the vault — the model does not read memory bodies.
- The HTML is self-contained — no network, no CDN, no fonts, no `<img src>`; all interpolations are HTML-escaped (safe to **open**).
- Memory bodies pack single paragraphs up to ~1,600 chars per line — **use this script, not `grep`/`wc`/`sed`**, which truncate or miscount.
