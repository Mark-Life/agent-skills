# Stacked pull requests

Read [`SKILL.md`](SKILL.md) and [`pr.md`](pr.md) first. Each PR in a stack is a
normal PR and follows `pr.md`. This file adds the GitHub mechanics and the stack
overview that the bottom PR carries.

A stack is a chain of PRs where each one builds on the one below. Use it when one
change is too large to review as a single PR, but its parts can land in order.
Each PR still has one problem — `SKILL.md`, step 3.

## Mechanics

GitHub has native stacks, driven by the `gh stack` extension
(`gh extension install github/gh-stack`, docs at <https://gh.io/stacks>). The
bottom PR targets the trunk; every other PR targets the branch below it.

```bash
gh stack init feat/parse feat/api feat/ui    # create or adopt branches, bottom to top
gh stack add -Am "ui: add the empty state"   # commit and add a branch on top
gh stack submit --auto                       # push all, open drafts, link the stack
gh stack link 41 42 43                       # link PRs that already exist, bottom to top
gh stack sync                                # fetch, cascade-rebase, push, sync PR state
gh stack merge                               # merge the stack in one all-or-nothing step
```

- `gh stack submit --auto` uses generated titles. Set each title and body after,
  with `gh pr edit <n> --body-file <file>`.
- `gh stack submit` and `gh stack link` take `--remote`. Pass it on a fork, so
  the stack opens where the PRs belong.
- GitHub refuses a base change on a PR that is in a stack. Pick the bottom PR's
  base before you link. If the bottom PR depends on an unmerged PR elsewhere, it
  targets the trunk and its commit list shows that PR's commits; say so in
  `Before merge`.
- After a rebase, push with `gh stack sync` or `gh stack push`, not a per-branch
  `git push --force`, so every branch moves together.

## Where the text goes

The bottom PR's body has two parts. The stack overview comes first, then a `---`
rule, then `# This PR`, then that PR's own body in the `pr.md` template. The
other PRs carry only their own body; the GitHub stack UI links them.

Put the overview between `<!-- stack-overview -->` and `<!-- /stack-overview -->`,
so a script can replace it without touching the PR's own text. Update it whenever
a PR is added, dropped, or re-measured.

## Overview template

````markdown
<!-- stack-overview -->
# Stack: <what the whole stack does, in plain words>

<One or two sentences: what changes, in how many PRs. Bottom: #N. Top: #M.
Together: F files, +A / -D.>

**Gains**

- **<metric or capability>:** <before> to <after> (<Δ>).

**Costs**

- **<cost>:** <what it is and what bounds it>.

<mermaid diagram: before and after>

| PR | Change |
| --- | --- |
| #N | <imperative summary> |

## Evidence

<one line: how each PR was measured, and against what>

| PR | Metric | Before | After | Δ |
| --- | --- | --- | --- | --- |

## Risks

<only stack-level risks: a regression, a cut fallback, platform gaps>

## Before merge

- <what must happen first: a dependency PR, a flaky test, a CI run>

## Follow-ups

- <work the stack leaves open, with the PR it belongs to>

---

# This PR

<!-- /stack-overview -->
````

Leave out `Risks`, `Before merge`, or `Follow-ups` when there is nothing to put
in them. The repo's own template still governs `# This PR` — see `SKILL.md`.

## Gains and costs

This is the part a reviewer reads to decide if the stack is worth it. Write it as
two lists, so a reader scans them in seconds.

- One bullet per gain. Lead with a bold label, then the number:
  `**Build size:** 34,852 KB to 18,028 KB (-48%)`.
- Every measured gain shows its number. "Faster" alone is not a gain; "189 to
  107 ms" is.
- A capability gain shows its count too: `**Languages with color:** 36 to 152`.
- A cost names what the reviewer accepts: a worse metric, a beta dependency, a
  lost fallback, lockfile churn, a stub kept until upstream changes.
- Take every number from the `Evidence` table. A number with no row there does
  not belong in the list.

> **Gains**
>
> - **`bun run typecheck`:** 30.6 to 5.2 s on a Mac (5.9x), 51.3 to 7.1 s on Linux (7.2x).
> - **Peak memory, largest project:** 1,365 to 381 MB (3.6x less).
>
> **Costs**
>
> - **Beta checker:** tsrs is pre-1.0, pinned to one version.
> - **No Windows arm64 binary:** typecheck and the pre-commit hook fail there.

## Evidence

One row per measured metric, per PR. Each PR is measured against the PR below
it, and the bottom PR against the trunk. A row that got worse stays and appears
under `Costs`. Say which numbers were not re-run after a rebase or a late fix.
Each PR's own `Evidence` keeps the method; the overview keeps only the numbers.
Name what was not measured.

## Checks

Done when all of these hold, plus the checks in `SKILL.md` and `pr.md`:

- The bottom PR opens with the overview, between the two markers.
- Every PR in the stack is in the PR table, in stack order.
- Every number under `Gains` and `Costs` has a row in `Evidence`.
- The overview and each PR's own body give the same numbers.
