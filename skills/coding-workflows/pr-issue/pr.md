# Pull request

Read [`SKILL.md`](SKILL.md) first — it owns the title, the `Problem` section, the
visual receipts, and the style rules. This file owns the rest of the body.

## Steps

1. Write `Problem` from the failure, `Solution` from the idea.
2. Gather `Evidence`. Measure every number on `main` and on the branch with the
   same command, and run every test you cite. Done when each number and each
   result traces to a command run this session.
3. Walk every item of the `Risks` list below. Only then may it say `None`.

## Template

````markdown
**Problem:**

<prose>

**Solution:**

<prose>

<illustration, when the shape of the code changed>

---

*Evidence:*

<table: metric | main | branch | Δ>

<before | after images, when rendered output changed>

<tests run, with totals>

---

*Risks:*

<one bullet per risk, or `None`>
````

The template is exhaustive: four sections, that emphasis.

## Problem

The shape is in `SKILL.md`. A PR keeps it short — the diff is one click away, so
the section names the failure and cedes the lines to the reviewer.

The mechanism paragraph is the before: how the code works today, in plain words
— which part does what, in what order — so a cold reader follows it without
knowing this corner of the codebase.

When a change fixes a main defect and two incidental ones, the main defect owns
the first paragraph and the incidental ones share the second.

## Solution

The idea, at the level of the idea, and the after: how the code works once the
change lands, in the same plain words as the before. The diff shows the lines;
this section shows the shape. Cover the fallbacks, the edge cases, and what
happens when the new path fails.

> Capture the branch name, and when it is empty fall back to the short commit SHA
> from `git rev-parse --short HEAD`. If that also fails (a repo with no commits),
> fall back to `detached`.

State the decision, not the argument for it. *What* the code does and *what it
guards against* belong here; *why the alternative was rejected* belongs in a code
comment, a commit message, or a design doc. A clause beginning "because" that
explains the type system, the storage format, or the author's reasoning is
almost always such an argument.

> Bad: Because `arrangedBy` is derived rather than independent data,
> `deliveryMethodOf` treats the model as authoritative on read and falls back to
> the persisted value only when the model is unavailable — `delivery_method` is
> `jsonb`, so its TypeScript type is an assertion rather than a proof, and this
> keeps a row written by an older deploy from rendering a wrong actor.
>
> Good: On read the model wins over the persisted value, so rows written by an
> older deploy still name the right party.

An illustration closes this section when the shape of the code changed: a new
call order, a moved responsibility, a new path for data. `SKILL.md` picks the
form. Illustrations explain; receipts prove, and live in `Evidence`.

## Evidence

Receipts that the change does what `Solution` claims, and at what cost. Lead with
the strongest one.

**Numbers.** When the change moves anything measurable — latency, bundle size,
memory, query count, build or test time — show `main` against the branch, with
one line under the table naming the command:

> | Metric | main | branch | Δ |
> | --- | --- | --- | --- |
> | p95 `/search` latency | 840 ms | 210 ms | −75% |
> | client bundle (gzip) | 182 kB | 186 kB | +4 kB |
>
> `k6 run search.js` and `next build`, same machine, 3 runs each, median shown.

A row that got worse stays in the table; `Risks` names the trade-off.

**Behaviour.** A bug fix shows the failing case and one unaffected case, before
and after:

> | HEAD state | before | after |
> | --- | --- | --- |
> | detached (`git checkout HEAD~1`) | blank | `fd4b022` |
> | on `main` | `main` | `main` |

**Pictures.** Rendered output that changed shows here, before and after side by
side in a two-column table. A multi-step flow shows as a video or GIF walkthrough.
A new feature shows its after only.

**Tests.** One line per suite: what ran, the totals, what the new tests cover.

> `bun test`: 214 passed, 0 failed. 3 new tests cover the detached-HEAD fallback.

Never claim testing that did not happen — see the guardrail in `SKILL.md`.

## Risks

What a reviewer accepts by merging. Find the blast radius: walk every item, and
write one bullet for each that applies — the risk, then what bounds it.

- **Security**: crosses a trust boundary — auth, input parsing, secrets,
  permissions, SQL, shell execution, deserialization.
- **Regression**: changes behaviour that callers or users rely on, or makes a
  number worse (a row that got worse in `Evidence`).
- **Merge**: forces other open branches to rebase or rework — a wide rename,
  moved files, a changed shared type, a schema migration, lockfile churn.
- **Product**: decides something the product owner would want to weigh — a
  default, what users see, what they can no longer do.
- **Rollout**: needs a step or an order at deploy — migration first, a new env
  var, a feature flag, a data change that cannot be undone.

> - **Regression**: client bundle +4 kB gzip for the sanitizer, in exchange for
>   closing the XSS path in comments.
> - **Merge**: renames `useCart` to `useBasket` across 31 files; open branches
>   that touch the cart need a rebase.

When no item applies, a bare `None` on its own line is correct, and is the right
answer for most PRs.
