---
name: pr-issue
description: "Use when writing a pull request, issue, or ticket — title or body — or before running `gh pr create` or `gh issue create`."
version: 2.1.0
---

# PR & Issue

Write the title and body **Vim-style** — `area: summary`, then labelled sections
in template order.

Three words carry this skill.
**Symptom**: every body opens with the thing a human noticed.
**Mechanism**: the next paragraph names the exact code that misbehaves.
**Receipts**: any output shown was really produced, never output that would plausibly have been produced.

A PR is read once, in a hurry, by someone deciding whether to approve. An issue
is read once, weeks later, by someone deciding whether to work on it — and again
by whoever picks it up. Every sentence earns its place by moving that decision
along.

## Which artifact

A PR argues that a change should land. An issue argues that a change is needed.
The title, the `Problem` section, and the style rules are shared; everything
after them diverges.

| | Pull request | Issue / ticket |
| --- | --- | --- |
| Title mood | imperative — the change | indicative — the defect or the gap |
| Header block | none | `Labels:` / `Relates to:` |
| Body | Problem, Solution, Security Impact, Testing | Problem, Reproduction, Expected vs actual, Proposed solution |
| Evidence | commands you ran, output you copied | steps that reproduce, revision the line numbers pin to |
| Tone of the fix | decided | proposed, with the open questions named |

**Read one reference, now, before drafting.** This file carries only what both
artifacts share.

- Writing a pull request → [`pr.md`](pr.md)
- Writing an issue, ticket, or bug report → [`issue.md`](issue.md)

## Shared steps

1. Gather the ground truth in full. For a PR that is the diff
   (`git diff <base>...HEAD`), read until every changed file is accounted for,
   not until the shape is clear. For an issue it is the code path that fails,
   read until you can name the line that decides the wrong outcome.
2. One artifact, one problem. A diff spanning unrelated areas splits into two
   PRs; a report bundling two defects splits into two issues.
3. Draft the title from the area of the largest coherent change.
4. Follow the reference for the artifact — it owns the middle of the body.
5. Cut every clause that would not change what the reader does. Done when the
   body is under 400 words.
6. Open it with a heredoc, so the markdown survives the shell:

   ```bash
   gh pr create --title "statusline: show commit SHA on detached HEAD" --body "$(cat <<'EOF'
   **Problem:**
   ...
   EOF
   )"
   ```

Done when all four hold, plus that artifact's own checks:

- The title is `area: summary`, lowercase after the colon, no period, under 72
  characters.
- The body has that artifact's sections, in template order, and nothing else. No
  `Changes`, no `Checklist`, no `Related issues` prose, no emoji, and no
  `Generated with` footer beyond what the harness requires.
- The body is under 400 words, and no section runs past two paragraphs of prose.
  Going over needs a reason the reader would agree with.
- Every command shown was executed this session, and its pasted output was copied
  from a real result.

**Never claim evidence that does not exist.** This is the one hard guardrail in
this skill: invented output is worse than no output, because the reader trusts
it. When a command was not run or a failure was not reproduced, the receipt is a
plain statement of that fact and of what was done instead.

> Not tested — no local Stripe webhook fixture for this event type. Verified by
> inspection against the `charge.refunded` payload in the Stripe docs.

## Title

`area` is the subsystem touched — a component, module, file stem, or feature.
Lowercase, one word where possible.

A **PR** summary is imperative and describes the change:

```
statusline: show commit SHA on detached HEAD
auth: reject expired refresh tokens on rotation
db: index orders on (artist_id, created_at)
```

An **issue** summary is indicative and describes the defect, specific enough to
be recognised again by someone who hit it:

```
auth: scope-insufficient 403 collapses into connection_rejected
statusline: branch segment is blank on detached HEAD
```

Compare the same artifacts titled badly: `Fix statusline bug` names the symptom
without the mechanism, `Update auth.ts` names the file, `fixes #12` names
nothing.

## Problem

Both artifacts open with this section, and it is written the same way in each.

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

Each reference says how far its `Problem` runs past this shape: a PR's is short
and cedes detail to the diff, an issue's carries the code excerpts.

## Style

These rules are this skill applied to PRs and issues; the general form is the
`agent-to-human` skill, which is their source of truth. This section stands on its
own, so `pr-issue` works whether or not that skill is installed.

**Omit needless words.** Everything below is that rule, made mechanical.

**One sentence, one idea.** A sentence carrying three clauses joined by
semicolons and em-dashes is three sentences wearing a trenchcoat. Split it. If a
sentence runs past about thirty words, it has more than one idea in it.

**Backtick what a reader would grep for.** Identifiers, commands, paths, flags,
literal values — but only on the mention that matters, not on every recurrence,
and never so densely that the prose becomes a symbol table. Three backticked
identifiers before the first verb means the sentence started in the wrong place.

**Prose, with bullets earned.** Prose is the default and carries any argument.
Bullets are permitted for three or more genuinely parallel items, one line each —
a list of removed call sites, say. The numbered steps in an issue's
`Reproduction` are the one list a template asks for. A bulleted list that is
really a changelog of the diff is a PR that wants splitting; a bulleted list that
is really a paragraph with dashes in front of it is a paragraph.

**Present tense, about the change.** The sentences describe behaviour, not
authorship.

**Name a thing once.** Having written `DeliveryTbd{arrangedBy:'partner'}`, write
"the partner case" thereafter. Full ceremonial restatement of a symbol on each
mention is how a body doubles in length while saying nothing new.
