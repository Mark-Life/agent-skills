---
name: writing-for-readers
description: "Use when writing or editing published prose a reader will find on their own — an article, blog post, course lesson, landing page, docs page, newsletter. Triggers on 'write a post', 'rewrite this section', 'make this sound human', 'this reads like AI'. For output an agent hands back to a person (chat reply, status update, PR or issue body), use agent-to-human instead."
version: 1.0.0
---

# Writing for Readers

**Write it the way you would explain it out loud to a colleague.** Simple, short,
common words. The reader is not a beginner, and is also not reading closely: they
are skimming, on a phone, half-deciding whether to keep going.

**Assume the first draft is twice as long as it needs to be.** The rewrite every
example below comes from went 350 words to 155 with no fact lost. Cutting half is
the normal result, not an aggressive one.

Nine tells make prose read as machine-written within two sentences. Each one below
has a name, the rejected text, and the approved replacement. All examples are the
real before and after of one section, "Connections multiply with every parallel
session".

## 1. The aphorism pair

A short claim followed immediately by its mirror image.

> Rejected: Context is the cost you notice. Connections are the one you do not.
>
> Approved: Every MCP server you configure opens one live client per session.

The pair sounds like insight and carries one fact at most. Write the fact.

## 2. The clipped callback

A sentence fragment closing a paragraph by echoing an earlier phrase.

> Rejected: Five servers, five of those.
>
> Approved: Five servers means five of those in every session you have open.

Also rejected: "It has not faded yet." A fragment is doing rhythm, not work. Fold
it into the sentence it echoes, or cut it.

## 3. The thesis opener

A three-word verdict starting a paragraph that the next two sentences then say
properly anyway.

> Rejected: Sessions are the multiplier. Background agents, agent teams, a second
> terminal, a worktree per branch, a CI runner: each one is its own session
> opening its own full set.
>
> Approved: But a background agent, a second terminal, a worktree per branch, a CI
> runner each open the full set again.

Also rejected: "This has a shelf life." Delete the opener and read the paragraph
again. Nothing is missing.

## 4. Negate-then-correct

Saying what is not the case in order to set up what is.

> Rejected: Sub-agents are not the multiplier — one that names an
> already-configured server shares the parent session's connection.
>
> Approved: A sub-agent reuses the parent's connections unless a server is defined
> inline in its frontmatter.

The reader was not holding the wrong belief you are correcting. Say what is true.

## 5. Announcing the structure

A sentence that introduces the next point instead of making it.

> Rejected: Now the part that weakens the argument, because it is real. MCP
> revision 2026-07-28 makes the protocol stateless.
>
> Approved: The MCP spec went stateless on 28 July, which solves part of this.

Also rejected: "There are two catches." "Two things keep the count real today."
The reader can see there are two once you have written them.

## 6. The speech close

A paragraph ending on a flourish, the way a talk ends.

> Rejected: Expect this argument to fade over the coming months. It has not faded
> yet.
>
> Approved: …but you still have to wait for that to reach everywhere, and it
> doesn't help servers on your own machine, since those start a separate program
> for every client either way.

End the paragraph on its last fact, not on a line written to land.

## 7. Em dashes

Use a comma, a semicolon, or two sentences. The same sentence as tell 4, because
one em dash is usually hiding one of the other tells.

> Rejected: Sub-agents are not the multiplier — one that names an
> already-configured server shares the parent session's connection.
>
> Approved: A sub-agent reuses the parent's connections unless a server is defined
> inline in its frontmatter.

An em dash usually marks a clause the writer had not decided where to put, so
place it: inside the sentence with a comma, beside it with a semicolon, or after
it as its own sentence.

## 8. Unused precision

Detail the reader will not do anything with: restated dates, spec header names,
exhaustive version lists, retry counts.

> Rejected: MCP revision 2026-07-28, published on 28 July 2026, makes the protocol
> stateless: it removes the initialize/notifications/initialized handshake and
> deletes protocol-level sessions along with the Mcp-Session-Id header, so every
> request carries its own protocol version and capabilities in _meta.
>
> Approved: The MCP spec went stateless on 28 July.

Also cut: "up to five attempts", and "the TypeScript, Python, Go and C# SDKs
shipped support at release with Rust in beta". Keep a number when the reader does
something with it: "Five servers across six sessions is thirty clients" survived,
because the count is the argument.

## 9. Avoidable jargon

A term the reader has to decode where a plain phrase is just as exact.

> Rejected: a stdio server is a child process your machine launches and keeps alive
> until you quit, and an HTTP server is a connection your harness reconnects with
> backoff when it drops
>
> Approved: A server on your own machine runs as a separate program until you quit;
> a remote one holds a connection your harness reconnects when it drops.

Keep the terms that lose meaning when swapped: MCP, sub-agent, frontmatter,
gateway, `p99`, refresh token. Swap everything around them. The general
plain-words discipline is in `agent-to-human`; this is the published-prose case of
it.

## Keep

- Concrete numbers that carry the argument. Thirty clients is the point of that
  paragraph.
- Source links, on the phrase they belong to. If the phrase survives the cut, the
  link goes with it.
- Second person. You, your laptop, your harness.
- The technical claim exactly as it was. Shorter is a rewrite of the prose, never
  of the fact.

## The pass over a finished draft

Run this before you call a draft done. It is mechanical; do it literally.

1. Read the **first sentence of every paragraph** on its own. Ask whether the
   paragraph would survive its deletion. When it would, delete it. That is tells 1,
   3 and 5.
2. Read the **last sentence of every paragraph** on its own. Ask whether it states
   a fact or performs an ending. Performances go. That is tells 2 and 6.
3. Search the draft for `—`. Every hit becomes a comma, a semicolon, or a full
   stop.
4. For every number, date and proper noun, name what the reader does with it. No
   answer means cut it.
5. Compare the word count against the draft you started from. Not roughly half is
   a reason to look again, not proof of failure: say which fact kept the length.
