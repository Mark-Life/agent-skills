# Pull request

Read [`SKILL.md`](SKILL.md) first — it owns the title, the `Problem` section, and
the style rules. This file owns the rest of the body.

## Steps

1. Write `Problem` from the failure, `Solution` from the idea.
2. Run every command you are about to cite in `Testing`. Copy its real output.
   Done when no fenced line in `Testing` is unsourced.
3. Assess `Security Impact` against auth, input parsing, secrets, permissions,
   SQL, shell execution, and deserialization. Only then may it say `None`.

## Template

````markdown
**Problem:**

<prose>

**Solution:**

<prose>

---

*Security Impact:*

<prose or `None`>

---

*Testing:*

<prose>

```
<real output>
```

<before/after sentence>
````

The template is exhaustive: four sections, that emphasis.

## Problem

The shape is in `SKILL.md`. A PR keeps it short — the diff is one click away, so
the section names the failure and cedes the lines to the reviewer.

When a change fixes a main defect and two incidental ones, the main defect owns
the first paragraph and the incidental ones share the second.

When the change is visual, paste a screenshot of the UI as it looks before the
fix — the "before" half of a before/after pair.

## Solution

The idea, at the level of the idea. The diff shows the lines; this section shows
the shape. Cover the fallbacks, the edge cases, and what happens when the new
path fails.

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

When the change is visual, paste a screenshot of the UI after the fix — the
"after" that pairs with the `Problem` screenshot.

## Security Impact

A real assessment, not a ritual. When the change crosses a trust boundary, state
the exposure and why the change is safe. Otherwise a bare `None` on its own line
is correct, and is the right answer for most PRs.

## Testing

Receipts. The output block comes first, after at most a one-line lead-in naming
what was run — it is the section's evidence, and a reviewer scanning for green
should not have to read past a paragraph to find it. Then what the new tests
cover, then one closing sentence contrasting before with after and confirming the
unaffected path is unchanged. Suite totals suffice; never paste a full test log.

> Ran the script against a throwaway repo in detached HEAD (`git checkout HEAD~1`):
>
> ```
> old logic (--show-current || echo detached): []
> new logic (fallback to short SHA):           [fd4b022]
> ```
>
> Before, the branch segment was blank; after, it shows the short SHA. On a normal
> branch the output is unchanged.

Never claim testing that did not happen — see the guardrail in `SKILL.md`.
