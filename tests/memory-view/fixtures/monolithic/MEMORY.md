# Widget Service Project Memory

## Architecture
- Bun workspaces monorepo: `apps/*`, `packages/*`
- `apps/api` — Hono server, deployed to Fly.io
- `packages/core` — shared domain types and pure functions
- Postgres via `effect-postgres`, migrations in `db/migrations`

## Key Patterns
- `@/*` alias maps to `./src/*` in every package
- All RPC wire models are `Schema.Struct`, never `Schema.Class`
- Tests run against an ephemeral container, never the prod database

## Gotchas
- The seed script must run before integration tests or fixtures are empty
- `pnpm build` requires `NODE_OPTIONS=--max-old-space-size=4096` on CI
- Never commit `.env.local`; the deploy reads secrets from the Fly vault

## Conventions
- Conventional Commits enforced by a commit-msg hook
- One feature per PR; squash-merge only
- Reviewers assigned automatically by CODEOWNERS

This MEMORY.md is prose with headings and bullets and zero links or topic files — content masquerading as an index. It is the monolithic case (IDX11): `--reindex` must be hard-blocked so this hand-written prose is never overwritten with a generated bullet index.
