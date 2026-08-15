# Attribution

Sources behind `SKILL.md`. For humans. An agent applying the skill has no reason
to load this file.

## Human posts measured

Six posts supplied the quotations in "What human prose does" and the measurements
behind "Variance you can measure".

- <https://sunilpai.dev/posts/the-task-isnt-the-job/>
- <https://ethanniser.dev/blog/not-holding-back-the-ocean/> — "Most of this comes
  down to the fact that **I was really good at the old software engineering**",
  "a $500 iPhone", and the two-item numbered list in tell 11
- <https://t3.gg/blog/post/dream-job-revisited>
- <https://leerob.com/model-behavior> — "This naive approach to memory through
  files has worked surprisingly well, but there's more work to do…"
- <https://master.dev/blog/durable-objects-on-cloudflare/> — "Durable Objects
  are, well, durable", and the one-word paragraph "State."
- <https://earendil.com/posts/pi-autoresearch-and-databricks/>

Measured across five of them, splitting on `.`, `!`, `?` and counting a list item
as a paragraph: single-sentence paragraphs 20% to 52%; contractions one per 36 to
89 words; four of five use zero em dashes; shortest sentences 2, 2, 1, 3, 5.

Sentences-per-paragraph sequences:

- sunilpai: `1,1,1,2,4,2,1,6,2,5,3,2,1,5,3,5,1,3,6,2,2,3,10,3,5,5,2,6`
- ethanniser: `3,4,1,1,1,1,5,1,2,2,3,5,1,2,1`

## Pre-LLM baseline

Five Paul Graham essays (`paulgraham.com` slugs `makersschedule`, `avg`, `ds`,
`hp`, `gh`): 318 paragraphs, 20.9k words, sentence length mean 16.3 and sd 9.0,
25% of sentences under 10 words, 8.5% over 30, 38.7% of paragraphs at three or
four sentences, paragraph range 1 to 11, 2.5 colons per 1000 words.

## Research

- **Em dash rates** — E. M. Freeburg, "The Last Fingerprint: How Markdown
  Training Shapes LLM Prose", arXiv:2603.27006. Human baseline 3.23 per 1000
  words (8 published essays, 57,232 words; median 3.83, range 0.33 to 17.12);
  GPT-4.1 10.62, Claude Opus 4.6 9.09, DeepSeek V3 6.95, Llama models 0.00.
  Verified against the paper's Table 1 and body text.
- **Tricolon** — A. D. Bakhshi, "Saying More Than They Know", arXiv:2604.19768.
  225 argumentative texts. Abstract: LLM texts produce tricolon at nearly twice
  the expert rate. Per-document figures of 3.73 (human experts) against 7.13
  (models) were reported by a research agent from the body; I confirmed the
  abstract-level claim only.
- **Excess vocabulary** — arXiv:2406.07016 (2024 PubMed abstracts against a
  pre-2023 counterfactual: "delves" 28x, "underscores" 10.9x, "showcasing"
  10.2x) and arXiv:2403.07183 (ICLR reviews: "meticulous" 34.7x, "intricate"
  11.2x, "commendable" 9.8x).
- **Lexical repetition** — arXiv:2508.00086, on ChatGPT lexical diversity. The
  abstract supports the direction (newer models less human-like); the per-model
  repetition scores a research agent reported were not confirmed in the full
  text, so the skill states the rule without them.
- **Negation shapes** — the additive, absolute and tripled examples in tell 4
  come from
  <https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing>.
- **Em dash density example** — tell 7's rejected passage is from
  <https://www.aicheckr.io/blog/ai-slop-examples>.

## Drafts

Before-and-after pairs in tells 1 through 9 come from one rewrite of a section
titled "Connections multiply with every parallel session", which went 350 words
to 155.

The fragment, sincerity-word, colon-displacement and repeated-frame examples come
from an audit of `deployment-platform-choice.mdx` in the author's blog: zero em
dashes and 54 colons in 2747 words, a colon in 25 of 32 prose paragraphs.
