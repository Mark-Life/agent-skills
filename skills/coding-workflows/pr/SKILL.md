---
name: pr
description: Use when writing a pull request title, body, or description, or when about to run `gh pr create`. Produces a Vim-style `area: summary` title with a Problem/Solution body, extended with Security Impact and Testing.
version: 1.0.0
---

# PR

Write the title and body **Vim-style** — `area: summary`, then `Problem:` /
`Solution:` — extended with `Security Impact:` and `Testing:`.

Two words carry this skill. **Mechanism**: the Problem section names the exact
thing that misbehaves, not the symptom. **Receipts**: the Testing section pastes
output that was really produced, never output that would plausibly have been
produced.

## Steps

1. Read the diff (`git diff <base>...HEAD`) in full. The body describes the
   change that exists, not the change that was planned.
2. If the diff spans unrelated areas, split the PR. Two problems means two PRs.
3. Draft the title from the area of the largest coherent change.
4. Write `Problem` from the failure, `Solution` from the idea.
5. Run every command you are about to cite in `Testing`. Copy its real output.
6. Open the PR with a heredoc, so the markdown survives the shell:

   ```bash
   gh pr create --title "statusline: show commit SHA on detached HEAD" --body "$(cat <<'EOF'
   **Problem:**
   ...
   EOF
   )"
   ```

Done when all four hold:

- The title is `area: imperative summary`, lowercase after the colon, no period.
- The body has the four sections, in template order, and nothing else.
- Every command in `Testing` was executed this session, and its pasted output was
  copied from a real result.
- `Security Impact` says `None` only after auth, input parsing, secrets,
  permissions, SQL, shell execution, and deserialization were each considered.

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

The template is exhaustive: four sections, two rules, that emphasis. A PR body
carries no `Changes`, no `Checklist`, no `Related issues`, no emoji, and no
`Generated with` footer beyond what the harness requires.

## Sections

### Title

`area` is the subsystem touched — a component, module, file stem, or feature.
Lowercase, one word where possible. The summary is imperative mood and describes
the change rather than the symptom.

```
statusline: show commit SHA on detached HEAD
auth: reject expired refresh tokens on rotation
db: index orders on (artist_id, created_at)
```

Compare the same PRs titled badly: `Fix statusline bug` names the symptom,
`Update auth.ts` names the file, `fixes #12` names nothing.

### Problem

The mechanism. Name the command, flag, function, or expression that misbehaves,
and say what it does instead of what it should do. A reader who has never opened
the code should understand the failure without opening the diff.

> In a detached HEAD state, `git branch --show-current` prints nothing and exits 0.
> The `|| echo "detached"` fallback only runs on a non-zero exit, so it never fires:
> `$branch` stays empty and the status line renders a blank name after the `|`
> separator.

For a feature, the mechanism is the gap the feature closes — still concrete,
still about the current state of the world.

### Solution

The idea, at the level of the idea. The diff is one click away and shows the
lines; this section shows the shape. Cover the fallbacks, the edge cases, and
what happens when the new path fails.

> Capture the branch name, and when it is empty fall back to the short commit SHA
> from `git rev-parse --short HEAD`. If that also fails (a repo with no commits),
> fall back to `detached`.

### Security Impact

A real assessment, not a ritual. When the change crosses a trust boundary, state
the exposure and why the change is safe. Otherwise a bare `None` on its own line
is correct, and is the right answer for most PRs.

### Testing

Receipts. What was run, the output it really printed, and one closing sentence
contrasting before with after and confirming the unaffected path is unchanged.

> Ran the script against a throwaway repo in detached HEAD (`git checkout HEAD~1`):
>
> ```
> old logic (--show-current || echo detached): []
> new logic (fallback to short SHA):           [fd4b022]
> ```
>
> Before, the branch segment was blank; after, it shows the short SHA. On a normal
> branch the output is unchanged.

**Never claim testing that did not happen.** This is the one hard guardrail in
this skill: invented output is worse than no output, because a reviewer trusts it.
When the change was not exercised, the receipt is a plain statement of that fact
and of what was done instead.

> Not tested — no local Stripe webhook fixture for this event type. Verified by
> inspection against the `charge.refunded` payload in the Stripe docs.

## Style

Prose inside every section, two to five sentences. A section that wants a bullet
list is a PR that wants splitting. Inline-code every identifier, command, path,
flag, and literal value. Write in present tense about the change itself, so the
sentences describe behaviour rather than authorship.
