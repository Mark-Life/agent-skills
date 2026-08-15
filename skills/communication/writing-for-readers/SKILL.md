---
name: writing-for-readers
description: "Writing prose a reader chose to read. Use when drafting or editing a blog post, article, docs page, landing page or newsletter, or when a draft reads like AI. For output handed back to the user, use agent-to-human."
version: 1.1.0
---

# Writing for Readers

**Write it the way you would explain it out loud to a colleague.** Short, common
words. The reader knows the field and is skimming, on a phone, half-deciding
whether to keep going.

**Assume the first draft is twice as long as it needs to be.** Cutting half with
no fact lost is the normal result. This file is instructions, not published
prose: apply its rules, do not copy its shape.

## What human prose does

**Says "I" and takes a side.** The writer is a person with a stake, and breaks in
with an aside or a word said out loud: "Durable Objects are, well, durable."
Another: "Most of this comes down to the fact that I was really good at the old
software engineering."

**Admits what it does not know**, once, as a position: "This naive approach to
memory through files has worked surprisingly well, but there's more work to do."
Hedges stacked across a sentence do the opposite.

**Names things.** Every paragraph carries one number, proper noun or date a
reader could dispute, like "a $500 iPhone". A paragraph someone who knew nothing
could have written is the problem, and no sentence-level edit fixes it.

**Calls back by repeating the exact words.** Rotating a dashboard into an
interface, then a portal, then the analytics hub is the machine move. Say "the
dashboard" three times.

## Variance you can measure

Print the sentences-per-paragraph sequence before publishing, then check:

1. **No four consecutive paragraphs with the same sentence count**, except runs
   of single-sentence paragraphs.
2. **At least one paragraph in seven is a single sentence.** Human posts run 20%
   to 52%.
3. **Sentence-length standard deviation of 8 words or more.** Reach it by mixing
   about a quarter of sentences under 10 words with roughly one in twelve over
   30, never by padding.
4. **One sentence under 5 words and one over 35 per 1000 words**, the extremes on
   top of item 3's mix. A one-word paragraph answering its own heading counts.

Contractions: at least one per 90 words, and zero contractions in first-person
prose fails on its own. Sentence openers: if one word starts more than 15% of
sentences, rewrite the excess.

## The tells

A line often trips more than one tell. Count it once, under the lowest-numbered
tell whose search finds it.

### 1. The aphorism pair

A short claim followed immediately by its mirror image, or by itself.

Rejected: Context is the cost you notice. Connections are the one you do not.
Approved: Every MCP server you configure opens one live client per session.

The pair sounds like insight and carries one fact at most. Write the fact. Same
family: "But a Worker is still a Worker" and "The cheapest platform on this list
is also the one most shaped like itself." Search sentences where one noun appears
twice, plus `is also the` and ` too.`

### 2. The clipped callback

A sentence fragment closing or opening a paragraph, echoing a phrase nearby.

Rejected: Five servers, five of those.
Approved: Five servers means five of those in every session you have open.

Also: "The spectrum, roughly." "A story from the same client." Rewrite any first
or last sentence with no subject and verb of its own. Mid-paragraph fragments
stay when the sentence before supplies the verb.

### 3. The thesis opener

A short verdict starting a paragraph that the next two sentences then say
properly anyway.

Rejected: Sessions are the multiplier. Background agents, agent teams, a second
terminal, a worktree per branch, a CI runner: each one is its own session opening
its own full set.
Approved: But a background agent, a second terminal, a worktree per branch, a CI
runner each open the full set again.

Also: "This has a shelf life." "That is the whole method." Delete the opener and
reread the paragraph; nothing is missing. Inverted, the same move is a long setup
knocked down by three words: "they assumed this is what real infrastructure
costs. It is not." Allowed once per piece, counted against the tell 4 budget.

### 4. Negate-then-correct

Saying what is not the case in order to set up what is.

Rejected: Sub-agents are not the multiplier: a sub-agent that names an
already-configured server shares the parent session's connection.
Approved: A sub-agent reuses the parent's connections unless a server is defined
inline in its frontmatter.

Additive: "not only dismissive but also unnecessarily harsh." Absolute: "not a
mirror but a portal." Tripled: "Not a career, not a body of work, not sustained
relevance, just an algorithmic moment."

Budget one per 1000 words, never two in a paragraph. Keep the hit that corrects a
belief the reader holds, so "Workers is not Node" survives, and state the rest
positively. Search `, not `, `not just`, `not only`, `is not `, `are not `,
`rather than`, `isn't`.

### 5. Announcing the structure

A sentence about the article instead of about the subject.

Rejected: Now the part that weakens the argument, because it is real. MCP
revision 2026-07-28 makes the protocol stateless.
Approved: The MCP spec went stateless on 28 July, which solves part of this.

Also: "There are two catches." "The bandwidth line deserves its own paragraph."
Counting items before listing them is the same move, as are "In this article we
will explore" and "In summary". For the closing case, cut the final paragraph; if
no fact is lost, leave it cut. Search sentences whose subject is part of the
document (paragraph, section, post, story, spectrum, questions), plus
`In summary`, `In conclusion`, `Overall`, `Let's`, `we'll explore`,
`as we've seen`.

### 6. The speech close

A paragraph ending on a line written to land, the way a talk ends.

Rejected: Expect this argument to fade over the coming months. It has not faded
yet.
Approved: The spec change still has to reach every harness, and it doesn't help
servers on your own machine, since those start a separate program for every
client either way.

The check: a paragraph's last sentence carries a noun that appears nowhere
earlier in that paragraph, or states a fact the paragraph has not stated. A
sentence recombining words already present is a performance. Callbacks repeat
exact words on purpose, so put them anywhere except a last sentence. A last
sentence you would screenshot is a pull-quote: keep one per piece, at the end,
and cut the rest.

### 7. Em dashes, and what replaces them

An em dash marks a clause the writer had not decided where to put. Place it:
inside the sentence with a comma, beside it with a semicolon, or after it as its
own sentence. Target zero; models run about three times the human rate.

Rejected: Remote work isn't going anywhere — it's evolving. Companies are
adapting — some faster than others — and the ones that embrace flexibility —
truly embrace it — will win the talent war.

Banning the em dash displaces it. One draft came back with zero em dashes and 54
colons in 2747 words, a colon in 25 of its 32 prose paragraphs, against about 2.5
colons per 1000 words in human essays. So count colons and semicolons too, and
cap the frame `X is the Y:` at two per piece.

### 8. Unused precision

Detail the reader will not do anything with: restated dates, spec header names,
exhaustive version lists, retry counts.

Rejected: MCP revision 2026-07-28, published on 28 July 2026, makes the protocol
stateless: it removes the initialize/notifications/initialized handshake and
deletes protocol-level sessions…
Approved: The MCP spec went stateless on 28 July.

Also cut: "up to five attempts", and "the TypeScript, Python, Go and C# SDKs
shipped support at release with Rust in beta". Keep a number that carries the
argument: "Five servers across six sessions is thirty clients" survived.

### 9. Long words and the vocabulary cluster

A term the reader has to decode where a plain phrase is just as exact.

Rejected: a stdio server is a child process your machine launches and keeps alive
until you quit, and an HTTP server is a connection your harness reconnects with
backoff when it drops
Approved: A server on your own machine runs as a separate program until you quit;
a remote one holds a connection your harness reconnects when it drops.

Keep terms that lose meaning when swapped: MCP, sub-agent, frontmatter, gateway,
`p99`, refresh token. Swap everything around them. The measured cluster is
delve, underscore, showcase, meticulous, intricate, commendable, crucial,
pivotal, robust, comprehensive, insights, tapestry, testament, seamless, vibrant,
nestled, boasts. Density is the tell, so flag any paragraph with three or more.
Literal senses are fine; the flagged uses are "underscore" as a verb and
"tapestry" as an abstract noun. Inflated copulas ("serves as", "stands as",
"boasts", "features") all mean is or has. Significance tails claim broader
importance in a closing participle: "…marking a pivotal moment in the evolution
of regional statistics in Spain." Delete the tail.

### 10. Sincerity words

Adverbs and stance phrases that claim candour instead of adding information.
Delete on sight: honestly, honest, genuinely, genuine, truly, actually, frankly,
quietly, deeply, fundamentally, remarkably, crucially, importantly, to be fair,
worth saying plainly, full stop, the honest answer. Also "real" wherever removing
it leaves the sentence true.

Every deletion leaves a working sentence: "containers (Railway, Fly, a VPS) are
the honest fit" becomes "containers fit". Headings are in scope, so "The
platforms, honestly" becomes "The platforms", because a heading names content,
never your attitude to it. The exception is a contrast the text sets up, as in
"nominally X, actually Y" where the nominal claim appears on the page.

### 11. The rule of three

Three-item lists as a default rhythm, and triple adjective stacks carrying the
information of one, as in "Our platform is powerful, robust, and scalable."
Models run about twice the human rate. Budget four per 1500 words, cut any triple
whose items are near-synonyms to a single item, and vary surviving lists to two
or four. Two-item lists are fine: one published post builds its whole argument on
a two-item numbered list.

### 12. The repeated frame

Two paragraphs on the same mould, or two sentences opening the same way. A human
varies the frame when the content varies, so a repeated mould outweighs any
single sentence. One draft ran five platform paragraphs on an identical four-slot
template, four of them closing on the literal string "Right for", and closed the
piece on three imperatives in a row.

Search: extract the first four and last four words of every paragraph in a
section. A repeat across three paragraphs fails. No two consecutive sentences
share their first two words. Three or more consecutive sentences opening on an
imperative verb is a speech close; collapse them into one sentence.

## Keep

- Source links, on the phrase they belong to, pinned to the exact artifact and
  line range where one exists rather than to a homepage.
- Second person. You, your laptop, your harness.
- The technical claim exactly as it was. Shorter is a rewrite of the prose, never
  of the fact.
- The irregularities already in a human draft you are editing: a comma splice, a
  sentence starting with "And", an inconsistent product capitalisation. Do not
  manufacture errors, and never introduce a factual one.

## The pass over a finished draft

Run this before you call a draft done. It is mechanical; do it literally.

1. Read the **first sentence of every paragraph** on its own. Delete it, reread
   the paragraph, and if no fact is missing, leave it deleted. Catches tells 1, 3
   and 5.
2. Read the **last sentence of every paragraph** in one column. Cut every
   fragment, and every sentence that only recombines words already in its
   paragraph. Keep at most one pull-quote. Catches tells 2 and 6.
3. Count `—`, `:` and `;`. Zero em dashes, and colons under roughly 3 per 1000
   words, or the ban displaced rather than fixed.
4. Run the tell 4 search. Keep one hit per 1000 words, the one correcting a
   belief the reader holds; state the rest positively.
5. Run the sincerity list and the vocabulary cluster, headings included. Delete
   every hit that leaves a working sentence.
6. For every number, date and proper noun, name what the reader does with it. No
   answer means cut it. Then the reverse: every paragraph needs one number,
   proper noun or date a reader could dispute.
7. Count comma lists of three or more, and each paragraph's first four and last
   four words. Over four triples per 1500 words, or one frame across three
   paragraphs, means rewrite.
8. Print the **sentences-per-paragraph sequence**, the sentence-length standard
   deviation, and the contraction count. Four consecutive equal paragraph counts,
   sd under 8, no sentence under 5 words, or zero contractions each mean flat
   rhythm.
9. Check the length. Rewriting: compare the word count with the source draft, and
   if the result is not near half, name the fact that kept it long. Drafting
   fresh: check every paragraph carries one fact a reader could repeat back.

Sources for the quotations and measured figures are in `ATTRIBUTION.md`. You do
not need to read it to apply this skill.
