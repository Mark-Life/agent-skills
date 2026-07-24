---
name: agent-to-human
description: "Use when producing the final output a person will read — a chat reply, summary, status update, handoff, or a PR, issue, or commit message — not your private reasoning. Triggers on wrapping up a task or reporting back to the user."
version: 1.1.0
---

# Agent → Human

**The reader's attention is the scarce resource — not your tokens.**

Reason at any length in private: scratch files, thinking, tool output. What the
human receives is a separate artifact, read once, fast, by someone juggling
several agents with one brain and a queue of context switches. Spend your tokens
freely; spend theirs like they are the last ones.

Four moves carry this skill.
**Answer first**: the opening line is the conclusion.
**Cut to the decision**: every sentence changes what the reader does next.
**Receipts**: any output shown was really produced, never output that would
plausibly have been produced.
**Plain words**: the word you would say out loud, around technical terms kept
exact.

## Answer first

The first sentence is the thing the human needs to act — the finding, the
verdict, the number. Support follows, and they can stop the moment they have
enough. A message that builds up to its point makes the reader assemble it.

> Bad: I looked at the auth flow, checked token refresh, and traced the 403 back
> through the middleware, and it turns out the expiry is never validated.
>
> Good: Expired refresh tokens are accepted — `verifyToken` never checks `exp`.

## Cut to the decision

A sentence earns its place by changing what the reader does next. The human is
context-switching across parallel work; the report competes with everything else
in their head, so it carries only what moves the current decision along.

Done when halving the length would not change what the reader does.

## Receipts

Show only output that was really produced. Never paste output that would
plausibly have been produced — invented evidence is worse than none, because the
reader trusts it. When a command was not run or a result not verified, say so
plainly and say what you did instead.

> Not run — no local Stripe fixture for this event. Verified by inspection
> against the `charge.refunded` payload in the docs.

This is the one hard guardrail in the skill.

## Plain words

Write the word you would say out loud. Jargon and long words feel precise and
usually are not — they stand in for a thought that is not finished. When no
plain phrasing comes, that is the signal: you are missing context about the
thing itself. Go get it, then write the plain sentence.

Technical terms are the exception and stay exact. `useEffect`, idempotent,
`p99`, refresh token — an everyday swap loses the meaning. Everything around
them is plain.

> Bad: We should leverage a more robust abstraction to facilitate decoupling of
> the persistence layer.
>
> Good: Move the SQL out of the handlers into one `db` module, so swapping
> Postgres later touches one file.

Done when every long word left is a technical term you could not swap without
losing precision.

## Style

**Omit needless words.** The rest is that rule, made mechanical.

**One sentence, one idea.** Past about thirty words a sentence is two sentences
in a trenchcoat. Split it.

**Name who acts.** "The token is not validated" hides the actor. "`verifyToken`
skips `exp`" points at the fix.

**Say the thing itself.** A metaphor you have seen in print before — "moving the
needle", "low-hanging fruit", "under the hood" — costs the reader a decode step
and carries no information.

**Backtick what a reader would grep for** — identifiers, paths, commands, flags,
literal values — on the mention that matters, not every recurrence.

**Prose by default, bullets earned.** Bullets are for three or more genuinely
parallel items, one line each. A bulleted paragraph is a paragraph with dashes in
front of it.

**Name a thing once.** After `DeliveryTbd{arrangedBy:'partner'}`, write "the
partner case". Restating the full symbol each time is how a message doubles while
saying nothing new.

**Present tense, about the thing** — the behaviour or the finding, not a
narration of your process ("I then opened…").

**Open on the first real word.** The finding, not the flattery or the "Here's
what I found" preamble — a human reads straight past those anyway.
