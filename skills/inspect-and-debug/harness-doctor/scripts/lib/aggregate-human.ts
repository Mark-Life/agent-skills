/**
 * The `human` section: what the person had to say, and how often they had to say
 * it again.
 *
 * Only rows with `human === true` are considered. A keyword scan over unfiltered
 * turns produced a 70% false-positive rate in the reference audit, because the
 * agent's own text echoes back through transcripts. Two more filters run on top of
 * the `human` flag: harness markers are dropped, and fenced code and quoted lines
 * are stripped before matching, so a pasted log never reads as a complaint.
 */

import { clip, cmpStr, collapseWs, ranking, sum } from "./stats.ts";
import type {
  CorrectionBucket,
  HumanSection,
  RepeatedRequestCluster,
  SessionRow,
  UserMsgRow,
} from "./types.ts";

/** Markers that mean the turn is harness text, whatever the `human` flag says. */
const HARNESS_MARKERS: readonly string[] = [
  "<system-reminder>",
  "<task-notification>",
  "<command-name>",
  "<command-message>",
  "<local-command-stdout>",
  "[Request interrupted",
  "Caveat: The messages below",
  "<user-prompt-submit-hook>",
];

/**
 * Correction themes. Bucketed by what the human was fixing, not by keyword, so a
 * rule proposal can point at one behaviour: several patterns per theme, and a turn
 * may land in more than one bucket.
 */
const THEMES: readonly { bucket: string; patterns: readonly RegExp[] }[] = [
  {
    bucket: "scope creep",
    patterns: [
      /\bi (?:only|just) (?:asked|said)\b/,
      /\bi (?:only|just) (?:wanted|needed) (?:the|this|that|it|you to)\b/,
      /\bdid ?n[o']t ask (?:you )?(?:for|to)\b/,
      /\bthat[' ]?s? (?:not|nothing) what i asked\b/,
      /\bout of scope\b/,
      /\bstop (?:adding|creating|writing|making|building|refactor)/,
      /\bdo ?n[o']t (?:add|create|touch|change|refactor|rewrite|modify)\b/,
      /\bwhy did you (?:also|even|change|add|create|touch)\b/,
      /\bstick to (?:the|what)\b/,
      /\b(?:only|just) (?:the|this|that) (?:one|file|change|part)\b/,
      /\bnothing else\b/,
      /\btoo (?:much|far|many changes)\b/,
    ],
  },
  {
    bucket: "wrong tool",
    patterns: [
      /\buse (?:the )?(?:rg|ripgrep|executor|agent-browser|bun|pnpm|the [a-z-]+ skill|the [a-z-]+ cli|mcp)\b/,
      /\bdo ?n[o']t use\b/,
      /\bwrong (?:tool|command|script|approach|way)\b/,
      /\b(?:instead of|rather than) (?:using |running )?(?:npm|yarn|curl|grep|find|bash|the )/,
      /\bnot (?:npm|yarn|curl|grep|find)\b/,
      /\bwhy (?:are you|did you) (?:using|use) \b/,
      /\bthere ?[' ]?s (?:a|an) (?:skill|script|command|tool) for (?:that|this)\b/,
      /\brun it (?:with|through)\b/,
    ],
  },
  {
    bucket: "too verbose",
    patterns: [
      /\btoo (?:long|verbose|wordy|much text)\b/,
      /\bbe (?:more )?(?:concise|brief|short|terse)\b/,
      /\b(?:make it |be )?shorter\b/,
      /\bless (?:text|words|prose|output)\b/,
      /\bstop explaining\b/,
      /\bno need to (?:explain|summar)/,
      /\btl ?;? ?dr\b/,
      /\bcut (?:it|this|that) down\b/,
      /\bfewer words\b/,
      /\bwithout the (?:preamble|summary|explanation)\b/,
    ],
  },
  {
    bucket: "ignored an existing rule",
    patterns: [
      /\b(?:claude\.md|agents\.md|the skill|the rules?|my rules?|the instructions)\b[^.]{0,60}\b(?:says?|said|ignor|forgot|violat|not follow|did ?n[o']t follow)\b/,
      /\b(?:you )?(?:ignored|forgot|missed|skipped) (?:the|my|our) (?:rule|instruction|skill|convention|claude\.md|agents\.md)/,
      /\bas i (?:said|told you|asked|already said)\b/,
      /\b(?:i )?(?:told|asked) you (?:this|that|already|before|again)\b/,
      /\bread the (?:skill|rules?|claude\.md|agents\.md|instructions|docs)\b/,
      /\bfollow the (?:rules?|instructions|skill|convention|style)\b/,
      /\byou (?:keep|always) (?:doing|adding|writing|ignoring)\b/,
      /\bhow many times\b/,
    ],
  },
  {
    bucket: "wrong assumption",
    patterns: [
      /\b(?:that|this|it)[' ]?s (?:wrong|incorrect|not right|false|not true)\b/,
      /\byou[' ]?re (?:wrong|guessing|assuming|making that up)\b/,
      /\bdoes ?n[o']t exist\b/,
      /\bno such (?:file|function|field|method|command|option)\b/,
      /\byou (?:assumed|guessed|invented|made (?:that|it) up|hallucinat)/,
      /\bhallucinat/,
      /\bcheck (?:first|the (?:code|docs|file|source|actual))\b/,
      /\bwhere did you get (?:that|this)\b/,
      /\bnot how (?:it|this|that) works\b/,
    ],
  },
  {
    bucket: "redo or revert",
    patterns: [
      /(?:^|[,.!?;:]\s*|\b(?:and|then|now|please|just|so|you|we)\s+(?:should\s+|need to\s+)?)(?:revert|roll ?back)\b/,
      /\bundo (?:that|this|it|everything|your)\b/,
      /\bstart (?:over|again from)\b/,
      /\bredo (?:it|that|this)\b/,
      /\btry again\b/,
      /\bgit (?:checkout|reset|restore)\b/,
      /\b(?:remove|delete|drop) (?:what|everything|all) you (?:did|added|wrote|created)\b/,
      /\bthrow (?:it|that) away\b/,
      /\bnot what i (?:wanted|asked|meant)\b/,
    ],
  },
];

/** Words too common to identify a request when clustering repeated asks. */
const STOPWORDS = new Set([
  "the", "and", "for", "you", "that", "this", "with", "have", "from", "are",
  "not", "but", "can", "should", "would", "could", "please", "just", "now",
  "then", "was", "were", "what", "when", "where", "which", "how", "why", "all",
  "any", "its", "it's", "our", "your", "their", "them", "they", "there", "here",
  "get", "got", "let", "make", "made", "use", "using", "used", "need", "want",
  "one", "two", "into", "out", "off", "over", "some", "same", "than", "also",
  "about", "after", "before", "again", "still", "very", "more", "most", "will",
  "does", "did", "done", "doing", "has", "had", "been", "being", "like", "only",
]);

/**
 * Text with fenced code blocks, quoted lines, and harness tags removed, lowercased.
 * Correction patterns run over this, never over the raw turn, so a pasted error log
 * or a quoted agent reply cannot register as the human complaining.
 */
const matchable = (text: string) =>
  text
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/^\s*>.*$/gm, " ")
    .replace(/<[a-z-]+>[\s\S]*?<\/[a-z-]+>/gi, " ")
    .toLowerCase();

/** Chars past which a turn with no second-person address reads as a paste. */
const PASTE_CHARS = 2000;

/** First line of a pasted artefact: a path, or a report pointing at one. */
const PASTED_HEAD =
  /^(?:[\w.@~/-]*\/[\w.@-]+|[\w.-]+\.(?:md|ts|tsx|js|json|py|txt|log|csv))\b|^(?:report|summary|findings|results?|output)\b[^\n]{0,40}\b(?:is )?(?:at|in)\b/i;

/**
 * True when the turn is the human speaking, not the human pasting. A long block
 * with no "you" in it, or one opening on a path or a report pointer, is almost
 * always agent output pasted back, and it carries the agent's own words into the
 * correction buckets.
 */
const isPasted = (text: string) => {
  if (PASTED_HEAD.test(text.split("\n", 1)[0]?.trim() ?? "")) return true;
  return text.length > PASTE_CHARS && !/\byou(?:r|rs)?\b/i.test(text);
};

/** True when the turn is real human input worth scanning for a correction. */
const isScannable = (row: UserMsgRow) => {
  if (!row.human || row.side || row.kind !== "main") return false;
  const text = row.text.trim();
  if (text.length < 3) return false;
  if (text.startsWith("/")) return false;
  return !HARNESS_MARKERS.some((marker) => row.text.includes(marker));
};

/** Shortest strings first, ties alphabetical: deterministic sample selection. */
const pickSamples = (values: readonly string[], n: number) =>
  [...new Set(values)]
    .sort((a, b) => a.length - b.length || cmpStr(a, b))
    .slice(0, n)
    .map((s) => clip(s, 220));

/** Correction buckets with counts and two verbatim samples each. */
const correctionBuckets = (rows: readonly UserMsgRow[], top: number) => {
  const hits = new Map<string, string[]>();
  for (const row of rows) {
    const text = matchable(row.text);
    for (const theme of THEMES) {
      if (!theme.patterns.some((re) => re.test(text))) continue;
      const bucket = hits.get(theme.bucket) ?? [];
      bucket.push(collapseWs(row.text));
      hits.set(theme.bucket, bucket);
    }
  }
  const buckets: CorrectionBucket[] = [...hits].map(([bucket, samples]) => ({
    bucket,
    count: samples.length,
    samples: pickSamples(samples, 3),
  }));
  return ranking(buckets, (b) => b.count, (b) => b.bucket, top);
};

/**
 * Cluster key for a request: significant words, deduped, sorted, first ten.
 * Word order and small edits do not change it, so "fix the typecheck errors" and
 * "typecheck is failing, fix the errors" land together.
 */
const requestKey = (text: string) => {
  const words = matchable(text)
    .replace(/[^a-z0-9\s./_-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  const uniq = [...new Set(words)].sort(cmpStr);
  return uniq.length < 4 ? "" : uniq.slice(0, 10).join(" ");
};

/** Near-duplicate human turns that appear in more than one session. */
const repeatedRequests = (rows: readonly UserMsgRow[], top: number) => {
  const per = new Map<string, { texts: string[]; sessions: Set<string> }>();
  for (const row of rows) {
    const words = row.text.trim().split(/\s+/).length;
    if (words < 4 || words > 400) continue;
    const key = requestKey(row.text);
    if (key === "") continue;
    const entry = per.get(key) ?? { texts: [], sessions: new Set<string>() };
    entry.texts.push(collapseWs(row.text));
    entry.sessions.add(row.sid);
    per.set(key, entry);
  }
  const clusters: RepeatedRequestCluster[] = [...per.values()]
    .filter((e) => e.sessions.size >= 2)
    .map((e) => ({
      label: pickSamples(e.texts, 1)[0] ?? "",
      count: e.texts.length,
      sessions: e.sessions.size,
      samples: pickSamples(e.texts, 2),
    }));
  return ranking(clusters, (c) => c.sessions, (c) => c.label, top);
};

/**
 * Human turns, interrupts, corrections bucketed by theme, and requests the person
 * had to make again in another session.
 */
export const humanSection = (
  userMsgs: readonly UserMsgRow[],
  sessions: readonly SessionRow[],
  top: number,
): HumanSection => {
  const human = userMsgs.filter(isScannable);
  // The count is every human turn; the scans see only the ones the human wrote
  // rather than pasted, so one pasted agent report cannot fill a bucket.
  const spoken = human.filter((row) => !isPasted(row.text.trim()));
  return {
    humanTurnCount: human.length,
    interrupts: sum(sessions, (s) => s.interrupts),
    corrections: correctionBuckets(spoken, Math.max(top, THEMES.length)),
    repeatedRequests: repeatedRequests(spoken, top),
  };
};

/** Every bucket the correction scan can produce. Exported for tests and docs. */
export const CORRECTION_BUCKETS = THEMES.map((t) => t.bucket);
