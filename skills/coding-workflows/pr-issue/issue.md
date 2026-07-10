# Issue

Read [`SKILL.md`](SKILL.md) first — it owns the title, the `Problem` section, and
the style rules. This file owns the rest of the body.

For a feature or chore ticket, drop `Reproduction` and `Expected vs actual`. The
symptom is what a user cannot do today; keep `Problem` and `Proposed solution`.

## Steps

1. Reproduce the failure yourself, then write the steps you actually took.
2. Cite code as `path/to/file.ts:LINE`, and name the revision those line numbers
   pin to (`git rev-parse --short HEAD`), so a reader can still find them on a
   branch that has moved.
3. Write `Proposed solution` as a proposal, and end it with what you are unsure
   of.

## Template

````markdown
# area: what is wrong

**Labels:** bug
**Relates to:** #850, #914

---

**Problem:**

<prose, with code excerpts>

**Reproduction:**

<prose lead-in>

1. <step>
2. <step>

**Expected vs actual:**

Expected: <one sentence>

Actual: <one sentence>

**Proposed solution:**

<prose>
````

The template is exhaustive: the header, then four sections.

## Header

Two lines above the rule, both optional, neither prose. `Labels:` carries the
labels the tracker actually defines. `Relates to:` carries issue numbers and
nothing else — an explanation of the relation belongs in `Problem` if it matters.

## Problem

The shape is in `SKILL.md`: symptom, then mechanism.

An issue may run longer here, and is the one place a code excerpt earns its
space: paste the branch that decides the wrong outcome under a `path:line`
comment, and quote the type or enum that has no room for the right answer. Say
where else the same mistake is copied. Then pin the line numbers to a revision —
they will drift, and a reader who knows which commit they were true at can find
them anyway.

> These are three independent copies, not one shared helper. The MCP copy already
> says "may lack access or required scope" in its 403 prose, but still emits
> `connection_rejected`, so a caller can act on the prose only by parsing English.
>
> Line numbers are against `738628132`.

## Reproduction

Numbered steps someone else can follow on a machine you do not control. Lead in
with one sentence naming what the reader must supply — the account, the fixture,
the upstream that behaves the right way — because a step list that assumes a
setup nobody has is not a reproduction.

> Needs an upstream that returns a distinguishable scope-insufficient 403. A
> Google connection works: authorize it for one product, then call an operation
> from another.
>
> 1. Create an OAuth connection whose grant omits a scope one operation requires,
>    while other operations keep working (so it is visibly a scope problem, not a
>    revoked token).
> 2. Invoke the tool for that operation.
> 3. The upstream returns 403 with `"reason": "ACCESS_TOKEN_SCOPE_INSUFFICIENT"`.

Each step is an action or an observation, never both. The last step is the
failure, stated so plainly that a reader can tell whether their own run
reproduced it.

Never claim a reproduction you did not run — see the guardrail in `SKILL.md`.

## Expected vs actual

Two sentences, one each, labelled. This is the section a triager reads first and
the one a fixer checks against at the end, so it repeats what `Problem` already
said — and that repetition is the point. Expected describes behaviour, not
implementation.

> Expected: a 403 indicating a scope shortfall carries a distinct code, so a
> caller knows re-authenticating the same grant will not help.
>
> Actual: every 401 and every 403 from all three plugins returns
> `connection_rejected`, the same re-authenticate message, and the same
> `oauth.start` hint, with no branch on the upstream body.

## Proposed solution

A direction, not a patch. Name the shape of the fix, say what stays untouched so
the change reads as additive, and point at the test that pins the old behaviour
and will have to move.

Then name what you are unsure of. A PR's `Solution` is decided; an issue's is a
proposal, and the open questions are the most useful lines in it — they turn a
report into a design conversation before anyone writes code.

> One shared code with a per-plugin detector seems right, given the three upstream
> error shapes differ. Whether the message should name the specific missing scope
> when the body provides it is worth deciding before implementing.
>
> `packages/plugins/mcp/src/sdk/plugin.test.ts:622` currently pins the old
> behaviour, asserting `connection_rejected` uniformly across a `[401, 403]`
> parametrization, and would need a scope-insufficient fixture alongside it.

Resist writing the diff here. If the proposal is long enough to need code, the
code belongs in the PR that closes the issue.
