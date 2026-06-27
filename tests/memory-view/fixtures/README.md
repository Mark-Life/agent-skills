# memory-view fixtures

Synthetic, broken-on-purpose memory vaults. The real machine vaults are almost
entirely clean, so the structural detectors (orphans, dangling entries, over-budget
index, broken links, etc.) would otherwise be unexercised. Each subdirectory is
shaped like a real `~/.claude/projects/<slug>/memory/` dir: a `MEMORY.md` index plus
topic `.md` files with nested-schema YAML frontmatter (except the cases that are
specifically about the index shape or the legacy schema).

These are **inputs for verifying detectors**, not test code — they live under
`tests/` so they are never shipped to a skill install. `tests/memory-view/scan.test.ts`
runs the detectors against them (`bun test`). To eyeball one by hand, point the
scanner at it from the repo root:

```bash
node skills/memory-view/scripts/scan-memory.ts tests/memory-view/fixtures/<case> --audit
```

All embedded "secrets" are deliberately fake, well-known example values.

## Cases → checks

| Fixture | Primary checks | What it triggers |
|---|---|---|
| `broken-links/` | LNK01, LNK02 | `broken-link-examples.md` has `[[does-not-exist]]` (no candidate, tier B remove), `[the missing page](missing.md)` (no candidate), and a typo'd `[[near-mtch]]` whose unique one-edit near-match `near-match.md` enables tier-A repair. Body broken edges > 0. |
| `orphans/` | IDX01 (LNK07 isolated) | `orphan-topic.md` exists on disk but is absent from `MEMORY.md` (`inIndex = false`). It is body-linked from `indexed-topic.md`, so it stays graph-reachable — isolating the index-orphan signal from the graph-orphan signal. |
| `dangling/` | IDX02 | `MEMORY.md` lists `ghost-file.md`, which does not exist on disk → an unresolved index edge. `present-topic.md` resolves cleanly for contrast. |
| `monolithic/` | IDX11 | `MEMORY.md` is prose with `##` headings, zero links, and no topic files (the `log-time` shape). `isMonolithic = true`; vault state = `monolithic`; `--reindex` must be hard-blocked. |
| `flat-schema/` | SCH11, SCH08, IDX09 | `project_agent_workflow.md` uses the legacy flat frontmatter (`type`/`originSessionId` at top level, no `metadata:` block, no `node_type`); its `name` ("Agent Workflow Notes") ≠ filename stem; snake_case filename. `frontmatter.shape = "flat"`. |
| `over-budget/` | IDX04, IDX05 | A generated `MEMORY.md` with 210 entries (212 lines) → `overBudget = true`, ~12 below-the-fold entries past the 200-line cliff (invisible to Claude). Index-only by design (no topic files committed) so entries are placeholder targets; it therefore also co-triggers IDX02 — the salient signals here are budget + below-fold. |
| `near-dup/` | DUP02 | `silent-empty-list-uuid.md` and `silent-empty-list-decode.md` are a *lexical* near-duplicate (the same memory re-saved with minor edits, sharing verbatim sentences) → high word-shingle Jaccard. This is what the deterministic DUP02 detector targets. Heavily *paraphrased* same-fact memories are DUP03 (semantic) and are intentionally left to the model during curation — word-shingle overlap can't catch them without flooding same-project vaults that share vocabulary. |
| `contradiction/` | CON01 | `default-branch-main.md` and `default-branch-master.md` are mutually `[[linked]]` and assert opposite facts about the repo's default branch. Candidate for model-resolved keep/merge. |
| `secrets/` | SEC01, SEC03 | `leaked-credentials.md` embeds an OpenAI `sk-proj-…` key, an AWS `AKIA…` access-key id, an AWS secret-access-key line, and a `/Users/janedoe/…` absolute path — all obviously fake. Redaction (on by default) rewrites them to `[REDACTED:*]`. |

`near-dup`, `contradiction`, and `secrets` carry deterministic structural signals only
incidentally; their main purpose is to feed the model-judgment (`candidates.ts`) and
redaction layers. The remaining six are pure deterministic structural fixtures.
