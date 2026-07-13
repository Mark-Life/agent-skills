---
name: product
description: "Primitive-first product design. Use when shaping a new product, app, SDK, API, or tool surface, deciding what to build and what to leave to the caller, writing a spec or PRD, or judging whether an idea is worth building."
version: 1.0.0
---

# Product

Product taste, accreted from what holds up in practice. Each principle below is
load-bearing on its own; apply the ones the current decision touches.

## Boil the ocean

**Scope the ambition to what agents made possible, not to what a team could
hand-write before them.** The cost of building collapsed, so the layer beneath
you is fair game to rebuild — the framework, the bundler, the auth vendor — and
the plan that sounds insane is worth costing out before it is dismissed. The
ambition that was reckless when a person wrote every line is now merely
expensive, and expensive is a number you can check.

## The primitive is the product

**The durable unit of value is the smallest capability others build on.**
Everything above it is packaging.

Agents do not navigate software; they compose it. They skip the GUI, the
onboarding, and the pricing page, and read the schema. The surface that used to
be a rounding error — the API, the tool definition, the error string — is now the
whole product. The best product for an agent is the best product for a developer.

**Name the primitive.** State the capability in one sentence and list its verbs.
An object store: put, get, list. A declarative graph of resources: plan, apply. A
virtual machine you rent by the hour. Each fits on a line and each spawned an
industry. If naming it takes a paragraph, or the verbs run to a dozen, you are
holding a feature bundle — split it until each piece states cleanly, then ask
which piece the others are built from. That one is the product.

The question that produces primitives is **"what capability should others build
on?"** — not "what feature ships next?" The second is answerable every sprint and
compounds into nothing.

**Every feature is a liability.** A feature is not free surface that sits inert
until someone wants it — it is another branch in the decision space every caller
must reason through, and an agent pays that cost on every call. Depth of feature
and depth of value part ways early: the tool with forty options is the tool whose
schema is guessed wrong. Compress the complexity into the abstraction rather than
exposing it as surface. The primitive that looks boring is the one that absorbed
the most.

The line between what you build and what you leave out is not importance, it is
whether the caller can produce it themselves. Build the thing that no amount of
downstream effort can paper over — sign-in should not cost three dashboards and a
pile of environment variables, so auth is yours. Leave the thing their agent
writes in an afternoon — organizations, roles, custom views. Ask of every
candidate feature: *could the caller's agent build this on my primitive?* If yes,
it is theirs, and building it for them buys you maintenance and costs them
nothing.

**Design for someone else's chain.** Assume your verb lands in a sequence you
will never see, beside tools you have never heard of. That assumption kills a lot
of instincts worth killing: the multi-step wizard, the flow that only works in
the order you imagined, the state you hold on the caller's behalf, the response
shaped for your own UI.

The vertically integrated product wins the users who want exactly that product.
The primitive wins everyone who wants something adjacent — including the people
who go on to build the integrated product on top of you. Opinion is worth
shipping as a layer *on* the primitive, never *instead of* it.

Third-party integrations are not leakage. Vendor consolidation is a human
anxiety; an agent has no loyalty to consolidate and picks on capability and
reliability alone. Every tool built on your primitive makes your primitive the
one worth calling.

**Contract over surface.** An agent's whole experience is the contract: the
schema it reads, the arguments it must guess, the error it gets back, the
guarantee it can lean on. Names are the documentation read first and often the
only one. Errors are the one chance to self-correct without a human — say what
was wrong and what to send instead. Idempotency and predictable failure are what
let a caller build a chain that survives a bad night. Reliability *is* the moat:
a feature-rich tool that fails one call in twenty gets dropped from the chain; a
boring one that never lies stays in it forever.

**Make the obvious assumption true.** A caller arrives with priors — what the
call is named, what the arguments are, what the error means, what a filesystem
does. The best surface is the one that confirms them, so the design question is
not *what is elegant?* but *what would a competent caller already assume?* — then
make that true, even where it costs you. Obvious and simple part ways here: the
assumed default is often the harder one to implement, and you absorb that
complexity precisely so the caller never spends a token guessing. Cleverness that
has to be learned is a tax charged on every call, forever.

**Fake the surface, never the contract.** Familiar affordances can be a mirage:
give the caller the filesystem, the shell, the local-looking loop it expects, and
implement it however you like underneath. Ergonomics may be simulated. But
durability, isolation, security, persistence, and production-readiness are the
contract — state those exactly, and never let a comfortable surface imply a
guarantee you do not keep. The caller who discovers the mirage reached the
guarantee stops trusting the surface too.

## The work announces itself

**Ask who schedules.** For any capability, someone decides that now is the moment
to use it. If that someone is a human typing into a box, the human is the
scheduler, and the ceiling on your product is their attention. The design
question underneath every feature is therefore *what signal starts this without
being asked?* — the error rate that crossed, the certificate about to lapse, the
deploy that regressed. A product whose every path begins with a prompt is an
assistant. One that begins with a signal is a system.

**Declare the state, reconcile continuously.** The imperative version scripts the
failures you thought of; the declarative version states the good world and closes
the gap forever. This is the same move that made *plan/apply* a primitive worth
building an industry on: the human writes the policy, the loop does the work. Ask
what the desired state is and what observation proves you are off it. If you can
name both, you can run without a scheduler.

**Reversibility is the autonomy boundary.** Split every action by whether undoing
it is cheap. Reversible ones — rollbacks, flag flips, scale-downs — run
unattended, because the cost of a wrong call is a second call. State-creating
ones — merged code, deleted data, sent mail — stop and present the case for
review, with the investigation attached so the human is approving rather than
re-deriving. This line, not a confidence score, is what makes autonomy safe to
grant, and it is a property of the surface you designed: shipping an undo *is*
shipping autonomy.

**Judgement is the scarce part.** Detecting that something changed is cheap and
mostly solved; deciding that it *matters* is the product. A system that surfaces
a thousand true deviations has shipped noise and will be turned off. Build where
ground truth exists — where the outcome is measurable after the fact, so the
judgement can be scored and improved rather than merely asserted.

## Grow a second nervous system

**Two consumers, one layer beneath.** The machine layer is not a replacement for
the visual one, it is the layer the visual one should sit on: API first, UI atop
it — good architecture whether or not the agents arrive. Do not anchor that layer
to a browser. A background agent never renders a page, and a design that requires
one has excluded the caller that never sleeps.

**Declare your capabilities.** A verb an agent cannot find is a verb it cannot
call, so discovery is part of the product, not documentation about it. State the
capabilities in a place a machine can reach without scraping — a spec plus agent
metadata at a well-known path — and serve plain text or markdown beside the HTML.
That last one costs almost nothing and is skipped almost always.

**Progressive discovery.** Context is the caller's scarcest resource, and your
spec is a bill charged against it. A surface of a dozen verbs can be handed over
whole. A surface of thousands cannot — dumping the full schema spends the budget
the caller needed for the actual work. Give it `search` and `execute` instead and
let it pull only the verb it needs. Note this is the other lever on the same
problem: shrink the surface, or make learning it lazy.

**The experience is a layer, not the product.** The question is never "is this
for agents or for humans?" — it is *which layer is the experience, and what is
exposed beneath it.* Transactional work — file the expense, book the flight,
check the balance — has no experience worth defending; the UI is friction and
agents should take it whole. Experience-first work — a game, a feed, a room you
want to be in — has an interface that *is* the value, and no API replaces it. But
that never means machine-invisible, for two separate reasons.

**Agents are the discovery channel.** The agent is what tells the human you
exist. A product whose entire value is a human experience still has to be legible
to the thing doing the recommending, or it does not get recommended. Build for
agents even when you do not build for agents: they are the road to the human.

**Expose the core beneath the experience.** A game is made so a person feels
something — and its core can still be driven headlessly in JSON with no UI at
all. That costs the experience nothing and buys a coding agent that can exercise
the rules, reproduce the bug, and test the logic. The machine layer here serves
the agent that *builds* you rather than the agent that calls you, and that is
reason enough to ship it.

---

Sources for each principle: [`README.md`](README.md).
