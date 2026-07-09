---
name: pr
description: "Use when writing a pull request title or body, or before running `gh pr create`."
version: 1.0.1
---

# PR

Write the title and body **Vim-style** — `area: summary`, then `Problem:` /
`Solution:` — extended with `Security Impact:` and `Testing:`.

Three words carry this skill. **Symptom**: every section opens with the thing a
human noticed. **Mechanism**: the Problem section then names the exact code that
misbehaves. **Receipts**: the Testing section pastes output that was really
produced, never output that would plausibly have been produced.

A PR body is read once, in a hurry, by someone deciding whether to approve. Every
sentence earns its place by moving that decision along.

## Steps

1. Read the diff (`git diff <base>...HEAD`) in full — done when every changed
   file is accounted for, not when the shape is clear. The body describes the
   change that exists, not the change that was planned.
2. If the diff spans unrelated areas, split the PR. Two problems means two PRs.
3. Draft the title from the area of the largest coherent change.
4. Write `Problem` from the failure, `Solution` from the idea.
5. Run every command you are about to cite in `Testing`. Copy its real output.
   Done when no fenced line in `Testing` is unsourced.
6. Cut every clause that would not change what a reviewer does. Done when the
   body is under 400 words.
7. Open the PR with a heredoc, so the markdown survives the shell:

   ```bash
   gh pr create --title "statusline: show commit SHA on detached HEAD" --body "$(cat <<'EOF'
   **Problem:**
   ...
   EOF
   )"
   ```

Done when all five hold:

- The title is `area: imperative summary`, lowercase after the colon, no period,
  under 72 characters.
- The body has the four sections, in template order, and nothing else.
- The body is under 400 words, and `Problem` and `Solution` are each at most two
  paragraphs. Going over needs a reason a reviewer would agree with.
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

The template is exhaustive: four sections, that emphasis. A PR body
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

Symptom first, mechanism second. The opening sentence says what a user or
operator sees; only then does the paragraph descend into the code. Name the
command, flag, function, or expression that misbehaves, and say what it does
instead of what it should do. A reader who has never opened the code should
understand the failure without opening the diff.

> The status line shows a blank name whenever the repo is on a detached HEAD.
> `git branch --show-current` prints nothing and exits 0 in that state, so the
> `|| echo "detached"` fallback — which only runs on a non-zero exit — never
> fires and `$branch` stays empty.

A reader who stops after that first sentence still learned the bug. Opening
instead at `git branch --show-current` makes them assemble the consequence
themselves.

For a feature, the symptom is what a user cannot do today, and the mechanism is
the gap the feature closes.

When a change fixes a main defect and two incidental ones, the main defect owns
the first paragraph and the incidental ones share the second.

### Solution

The idea, at the level of the idea. The diff is one click away and shows the
lines; this section shows the shape. Cover the fallbacks, the edge cases, and
what happens when the new path fails.

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

### Security Impact

A real assessment, not a ritual. When the change crosses a trust boundary, state
the exposure and why the change is safe. Otherwise a bare `None` on its own line
is correct, and is the right answer for most PRs.

### Testing

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

**Never claim testing that did not happen.** This is the one hard guardrail in
this skill: invented output is worse than no output, because a reviewer trusts it.
When the change was not exercised, the receipt is a plain statement of that fact
and of what was done instead.

> Not tested — no local Stripe webhook fixture for this event type. Verified by
> inspection against the `charge.refunded` payload in the Stripe docs.

## Style

**Omit needless words.** Everything below is that rule, made mechanical.

**One sentence, one idea.** A sentence carrying three clauses joined by
semicolons and em-dashes is three sentences wearing a trenchcoat. Split it. If a
sentence runs past about thirty words, it has more than one idea in it.

**Backtick what a reviewer would grep for.** Identifiers, commands, paths, flags,
literal values — but only on the mention that matters, not on every recurrence,
and never so densely that the prose becomes a symbol table. Three backticked
identifiers before the first verb means the sentence started in the wrong place.

**Prose, with bullets earned.** Prose is the default and carries any argument.
Bullets are permitted for three or more genuinely parallel items, one line each —
a list of removed call sites, say. A bulleted list that is really a changelog of
the diff is a PR that wants splitting; a bulleted list that is really a paragraph
with dashes in front of it is a paragraph.

**Present tense, about the change.** The sentences describe behaviour, not
authorship.

**Name a thing once.** Having written `DeliveryTbd{arrangedBy:'partner'}`, write
"the partner case" thereafter. Full ceremonial restatement of a symbol on each
mention is how a body doubles in length while saying nothing new.
