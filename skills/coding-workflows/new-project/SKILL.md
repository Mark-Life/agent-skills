---
name: new-project
description: Use when starting a brand-new project or repository from scratch. Triggers on "create a new project", "spin up a new app", "scaffold a new repo", "start a new Next.js project". Scaffolds from the personal Next.js monorepo template (Mark-Life/netxjs-monorepo) and runs the standard bootstrap.
version: 1.0.0
---

# New Project

Scaffold a new project from the personal Next.js monorepo template.

## When to use

- Starting a brand-new project / repo from scratch.
- Triggers: "create a new project", "spin up a new app", "scaffold a new repo", "new Next.js project".

## Steps

Replace `<project-name>` with the project name. Run from the directory where the project folder should live.

```bash
gh repo create <project-name> --template Mark-Life/netxjs-monorepo --private --clone
cd <project-name>
bun install
bun run upgrade
```

`bun run upgrade` updates Next.js, refreshes all shadcn/ui components, updates deps, and runs lint fixes.

## Notes

- Template: [Mark-Life/netxjs-monorepo](https://github.com/Mark-Life/netxjs-monorepo)
- `--clone` clones into the current directory; the new repo is created **private**.
