# `product` — credits

Taste accreted from reading, arguing, and shipping. Most principles in
[`SKILL.md`](SKILL.md) are distilled from someone else's writing — the phrasing
is mine, the idea is theirs — and each of those is credited below. The rest are
mine, sourced or not.

## The primitive is the product

**Amplify Partners** — [*The Primitive is the
Product*](https://www.amplifypartners.com/blog-posts/the-primitive-is-the-product)

The durable unit of value is the smallest capability others build on; agents
compose software rather than navigate it, so the schema, the verbs, and the
errors are the whole product. Source of *name the primitive*, *design for someone
else's chain*, *contract over surface*, and *every feature is a liability*.

## Design to the caller's priors

**Theo Browne** — [*Lakebed*](https://gist.github.com/t3dotgg/cbe978269b4c7258c4d20164aece7087)
(project manifesto)

Agents collapsed the cost of building, so the ambition should scale to match —
rebuilding React, Webpack and Clerk is on the table if that is what the primitive
needs. And what you do build should be obvious rather than clever, where
"obvious" means the default an agent already assumes: you eat the implementation
complexity so the caller never guesses. Affordances may be simulated freely;
contracts may not. Source of *boil the ocean*, *make the obvious assumption
true*, *fake the surface, never the contract*, and the build/don't-build test
(*could the caller's agent build this themselves?*).

## Grow a second nervous system

**Andrey Markin** (me) — [*The AI-Ready
Web*](https://andrey-markin.com/blog/ai-ready-web)

Services are growing a parallel machine layer beside the human one: the API is
primary, the UI sits on it, and neither consumer goes away. Capabilities have to
be declarable and discoverable without scraping or a browser, and on a large
surface the spec itself is a context bill — pay it lazily with `search`/`execute`
rather than dumping it. And the experience is a layer, not the product: even a
product that exists purely to make a human feel something needs a machine layer,
because agents are the channel through which the human hears you exist. Source of
*two consumers, one layer beneath*, *declare your capabilities*, *progressive
discovery*, *the experience is a layer*, and *agents are the discovery channel*.

**[ThePrimeagen](https://github.com/ThePrimeagen)** — his game, shown on stream;
no public repo

The game is built for a human to feel something, and its core is also playable
headlessly in JSON with no UI at all — which is what lets coding agents exercise
the rules, reproduce bugs, and test the core logic. The machine layer earning its
keep by serving the agent that *builds* the product rather than the one that
calls it. Source of *expose the core beneath the experience*.

## The work announces itself

**Boris Tane** — [*Proactive
Agents*](https://polylane.com/blog/proactive-agents/)

Agents that wait to be prompted leave the human as the scheduler; the next step
is systems that start from a signal, reconcile against a declared state, and act
inside a reversibility boundary. Source of *ask who schedules*, *declare the
state*, *reversibility is the autonomy boundary*, and *judgement is the scarce
part*.
