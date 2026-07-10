---
name: human-to-agent
description: "Use when writing or editing instructions a model will later execute — anything future context windows load as guidance. Triggers on 'edit this skill', 'update CLAUDE.md / AGENTS.md', 'write agent rules', 'improve this prompt'."
version: 1.0.0
---

# Human → Agent

**You are writing for a stochastic reader. Every instruction is a lever on how
predictably it behaves.** The aim is predictability — the agent taking the same
_process_ each run, not producing the same output. Each rule below buys some.

## Prompt the positive

State the behaviour you want. Prohibition backfires: _don't think of an elephant_
names the elephant and makes it more available, not less. Phrase the target so
the banned behaviour is never spoken. Keep a "don't" only as a hard guardrail you
cannot phrase positively, and even then pair it with what to do instead.

## Leading words

A **leading word** is a compact concept the model already holds from
pretraining — _tracer bullet_, _fog of war_, _tight_ loop, _receipts_. One
well-chosen word anchors a whole region of behaviour in a token, because it
recruits priors the model already has. Repeat it and its meaning accretes; use
the same word across your prompts, docs, and code so the agent links them and
fires the right behaviour.

Reach for one wherever you have spelled a quality out three times: "fast,
deterministic, low-overhead" is one idea restated — collapse it to _tight_.

## Cut no-ops

A **no-op** is a line the model already obeys by default: it costs context and
buys nothing. Test each sentence in isolation — does it change behaviour versus
the default? "Be thorough", when the model is already thorough-ish, is a no-op;
the fix is a stronger word (_relentless_), not more words. When a sentence fails,
delete the whole sentence rather than trim it.

## One source of truth

Keep each instruction in exactly one place. The same rule in two files
(**duplication**) rots the moment one copy changes, and inflates the rule's
apparent weight. When you change the behaviour, you want a one-place edit.

## Say how "done" is checked

Give the agent a **completion criterion** it can check — done from not-done,
observable. Where it matters, make it exhaustive: "every changed file accounted
for", not "list the changes". A vague criterion invites the agent to stop early.

## Be concrete

Name the file, the command, the flag, the value. Ambiguity is where a stochastic
reader diverges from your intent. A specific instruction beats a general one, and
an example beats a description.

## Prune

Instructions accumulate — adding feels safe, removing feels risky — until stale
layers pile up (**sediment**) and the whole thing is too long to follow
(**sprawl**). Prune on a schedule: drop no-ops, collapse duplication, and push
rarely-needed detail into a linked doc so the instruction that is always needed
stays legible.
