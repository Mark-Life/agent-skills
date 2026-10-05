---
name: full-cycle
description: "Use when the user brings an idea, a goal, or a discussion and wants it carried all the way to a reviewed, ready PR — e.g. 'optimize this app', 'make X faster', 'take this from idea to PR', 'full cycle'. Survey, decide with the human, implement, review until dry, ship with visuals."
version: 1.0.0
---

# Full cycle

Carry work from an idea to a PR a stranger can approve. Spend tokens freely:
fan out subagents in dynamic workflows wherever breadth, independent opinions or
adversarial checks make the answer better. The human spends attention: they
steer and correct, the agent does the deep work.

Five words carry this skill.
**Tier list**: every survey ends in a ranked list with one plain reason per row.
**Recommended**: every question to the human carries the agent's own pick.
**Receipts**: every number was really measured; what was not run is said.
**Skeptic**: every finding is reproduced by a second agent before anyone acts on it.
**Dry**: review ends only when rounds stop producing real findings.

## Asking the human

Research until you could make the call yourself, then hand the human the call.
Each **ask** lays out what they need to decide and nothing more: the options, what
each costs and gains, what it touches. Mark your pick `(recommended)` with one
plain reason. The human confirms, picks another, or redirects.

The human switches context all day, and a thread may span weeks. Each message
stands alone: answer first, plain words, one picture where a picture is faster
than a paragraph. A Mermaid map for structure and flow, a motion schematic for
what changes over time (`pr-issue` skill, `motion.md`), a screenshot or slowed
real recording for what a user sees. Style is owned by the `agent-to-human`
skill.

## Peers

From what the product is, name its peers: open-source apps and libraries that
face the same problem. For a coding-agent client that means other agent UIs,
editors and CLIs. Read their code, not their marketing. Every research stage
answers **"how did others solve this problem?"** with file paths as evidence.

## Stages

Gates marked **ask** wait for the human. Everything else runs unattended.

1. **Survey.** A workflow fans out across the problem space — for "optimize the
   app": rendering, startup, bundle, network, memory, server latency. Each agent
   measures or reads, not guesses, and checks the peers. Return a **tier list**
   of areas. **Ask** which to take.
2. **Deep dive.** Inside the chosen area, build or reuse a repeatable
   measurement, take a baseline, then return a tier list of concrete targets with
   their measured cost. A target whose cost is an estimate gets a **probe**: a
   throwaway fix, measured, reverted. Probes routinely refute the obvious
   suspect; rank by probe results.
3. **Options.** For the top target, 2–4 fixes, always including the answer to
   **"is there a stupid simple solution we're not thinking about?"** and the
   peers' approach. Prototype the serious ones in isolated worktrees and measure
   them interleaved. For each: upside, downside, what else it touches, and a
   picture of how the system changes. **Ask** which to build.
4. **Pre-review.** Before coding, one agent attacks the chosen design with
   **"what have we missed?"** and returns the final brief.
5. **Implement** in its own worktree and branch, following the repo's
   `AGENTS.md`/`CLAUDE.md` and owning specs.
6. **Review until dry.** See below.
7. **Evidence.** Rebuild before measuring; stale builds lie. Before and after
   run interleaved, five or more rounds, median with spread. Render or call
   counts beat milliseconds when timings are noisy. Run the full test suite once.
   Record media: slow a real recording until the difference is visible, and add a
   capture-only on-screen marker (a frame counter, a timestamp) when the change
   is about time.
8. **PR.** Write it with the `pr-issue` skill: before/after table, the options
   rejected and why, future work, visuals. Slice into one-problem PRs, stacked
   when they build on each other. Show the human the local media paths before
   any PR body changes. **Ask** before opening anything on a repo the human does
   not own.

## Review until dry

A review is a loop, not an agent.

- **Find.** Parallel reviewers, one lens each:
  - correctness: **"what have we missed?"**, proven with throwaway tests;
  - **"accessibility, other platforms, weird edge cases?"**: screen readers and
    keyboard, every runtime the product ships on, phones, slow hardware, and user
    settings — zoom, locale, RTL, reduced motion, OS themes;
  - **"can it be better, more performant, simpler?"**: subtract layers, state
    and dependencies that earn nothing;
  - repo hygiene and upstream readiness.
- **Sweep.** Mechanical unused-code check on everything the change adds:
  `knip`, `tsc --noUnusedLocals --noUnusedParameters`, and a grep proving every
  new export and returned field has a reader. Reviewers miss what tools see.
- **Validate.** A skeptic per lens reproduces each finding, defaults to false
  when it cannot, and drops anything that already happens on the base branch.
- **Fix** the confirmed ones; name the rest as follow-ups.
- **Repeat.** Done when two consecutive rounds yield no real finding — only false
  positives or "looks fine".
- **Picture check**, last round: compare the change against the schematics and
  videos agreed at the options stage. Behaviour drifted from the picture means
  fix the code or redraw the picture, and tell the human which.

## Done when

- Every ask carried a `(recommended)` pick and the human's answer is recorded.
- The PR shows measured before/after numbers with spread, and names what was not
  run.
- Two review rounds in a row came back dry, and the picture check passed.
- Every gate, test suite and build the repo defines passes on the final tree.
- A reader with no context understands the change from the PR's first paragraph
  and its visuals.
