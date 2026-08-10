"""The `human` section: what the person had to say, and how often again.

The Python twin of `lib/aggregate-human.ts`, theme for theme. Only rows with
`human == True` are considered, harness markers are dropped, fenced code and
quoted lines are stripped before matching, and pasted agent output is kept out
of the buckets, so a pasted log never reads as a complaint.
"""

import re

from .stats import clip, collapse_ws, ranking, total

# Markers that mean the turn is harness text, whatever the `human` flag says.
_HARNESS_MARKERS = (
    "<system-reminder>",
    "<task-notification>",
    "<command-name>",
    "<command-message>",
    "<local-command-stdout>",
    "[Request interrupted",
    "Caveat: The messages below",
    "<user-prompt-submit-hook>",
)

# Correction themes, bucketed by what the human was fixing, not by keyword.
_THEMES = (
    ("scope creep", (
        r"\bi (?:only|just) (?:asked|said)\b",
        r"\bi (?:only|just) (?:wanted|needed) (?:the|this|that|it|you to)\b",
        r"\bdid ?n[o']t ask (?:you )?(?:for|to)\b",
        r"\bthat[' ]?s? (?:not|nothing) what i asked\b",
        r"\bout of scope\b",
        r"\bstop (?:adding|creating|writing|making|building|refactor)",
        r"\bdo ?n[o']t (?:add|create|touch|change|refactor|rewrite|modify)\b",
        r"\bwhy did you (?:also|even|change|add|create|touch)\b",
        r"\bstick to (?:the|what)\b",
        r"\b(?:only|just) (?:the|this|that) (?:one|file|change|part)\b",
        r"\bnothing else\b",
        r"\btoo (?:much|far|many changes)\b",
    )),
    ("wrong tool", (
        r"\buse (?:the )?(?:rg|ripgrep|executor|agent-browser|bun|pnpm|the [a-z-]+ skill|the [a-z-]+ cli|mcp)\b",
        r"\bdo ?n[o']t use\b",
        r"\bwrong (?:tool|command|script|approach|way)\b",
        r"\b(?:instead of|rather than) (?:using |running )?(?:npm|yarn|curl|grep|find|bash|the )",
        r"\bnot (?:npm|yarn|curl|grep|find)\b",
        r"\bwhy (?:are you|did you) (?:using|use) \b",
        r"\bthere ?[' ]?s (?:a|an) (?:skill|script|command|tool) for (?:that|this)\b",
        r"\brun it (?:with|through)\b",
    )),
    ("too verbose", (
        r"\btoo (?:long|verbose|wordy|much text)\b",
        r"\bbe (?:more )?(?:concise|brief|short|terse)\b",
        r"\b(?:make it |be )?shorter\b",
        r"\bless (?:text|words|prose|output)\b",
        r"\bstop explaining\b",
        r"\bno need to (?:explain|summar)",
        r"\btl ?;? ?dr\b",
        r"\bcut (?:it|this|that) down\b",
        r"\bfewer words\b",
        r"\bwithout the (?:preamble|summary|explanation)\b",
    )),
    ("ignored an existing rule", (
        r"\b(?:claude\.md|agents\.md|the skill|the rules?|my rules?|the instructions)\b[^.]{0,60}\b(?:says?|said|ignor|forgot|violat|not follow|did ?n[o']t follow)\b",
        r"\b(?:you )?(?:ignored|forgot|missed|skipped) (?:the|my|our) (?:rule|instruction|skill|convention|claude\.md|agents\.md)",
        r"\bas i (?:said|told you|asked|already said)\b",
        r"\b(?:i )?(?:told|asked) you (?:this|that|already|before|again)\b",
        r"\bread the (?:skill|rules?|claude\.md|agents\.md|instructions|docs)\b",
        r"\bfollow the (?:rules?|instructions|skill|convention|style)\b",
        r"\byou (?:keep|always) (?:doing|adding|writing|ignoring)\b",
        r"\bhow many times\b",
    )),
    ("wrong assumption", (
        r"\b(?:that|this|it)[' ]?s (?:wrong|incorrect|not right|false|not true)\b",
        r"\byou[' ]?re (?:wrong|guessing|assuming|making that up)\b",
        r"\bdoes ?n[o']t exist\b",
        r"\bno such (?:file|function|field|method|command|option)\b",
        r"\byou (?:assumed|guessed|invented|made (?:that|it) up|hallucinat)",
        r"\bhallucinat",
        r"\bcheck (?:first|the (?:code|docs|file|source|actual))\b",
        r"\bwhere did you get (?:that|this)\b",
        r"\bnot how (?:it|this|that) works\b",
    )),
    ("redo or revert", (
        r"(?:^|[,.!?;:]\s*|\b(?:and|then|now|please|just|so|you|we)\s+(?:should\s+|need to\s+)?)(?:revert|roll ?back)\b",
        r"\bundo (?:that|this|it|everything|your)\b",
        r"\bstart (?:over|again from)\b",
        r"\bredo (?:it|that|this)\b",
        r"\btry again\b",
        r"\bgit (?:checkout|reset|restore)\b",
        r"\b(?:remove|delete|drop) (?:what|everything|all) you (?:did|added|wrote|created)\b",
        r"\bthrow (?:it|that) away\b",
        r"\bnot what i (?:wanted|asked|meant)\b",
    )),
)

_COMPILED_THEMES = tuple(
    (bucket, tuple(re.compile(p) for p in patterns)) for bucket, patterns in _THEMES
)

# Words too common to identify a request when clustering repeated asks.
_STOPWORDS = frozenset([
    "the", "and", "for", "you", "that", "this", "with", "have", "from", "are",
    "not", "but", "can", "should", "would", "could", "please", "just", "now",
    "then", "was", "were", "what", "when", "where", "which", "how", "why", "all",
    "any", "its", "it's", "our", "your", "their", "them", "they", "there", "here",
    "get", "got", "let", "make", "made", "use", "using", "used", "need", "want",
    "one", "two", "into", "out", "off", "over", "some", "same", "than", "also",
    "about", "after", "before", "again", "still", "very", "more", "most", "will",
    "does", "did", "done", "doing", "has", "had", "been", "being", "like", "only",
])

_FENCED = re.compile(r"```[\s\S]*?(?:```|$)")
_QUOTED_LINE = re.compile(r"^\s*>.*$", re.M)
_TAG_BLOCK = re.compile(r"<[a-z-]+>[\s\S]*?</[a-z-]+>", re.I)
_NON_WORD = re.compile(r"[^a-z0-9\s./_-]+")
_SPLIT_WS = re.compile(r"\s+")

# Chars past which a turn with no second-person address reads as a paste.
_PASTE_CHARS = 2000

# First line of a pasted artefact: a path, or a report pointing at one.
_PASTED_HEAD = re.compile(
    r"^(?:[\w.@~/-]*/[\w.@-]+|[\w.-]+\.(?:md|ts|tsx|js|json|py|txt|log|csv))\b"
    r"|^(?:report|summary|findings|results?|output)\b[^\n]{0,40}\b(?:is )?(?:at|in)\b",
    re.I,
)
_SECOND_PERSON = re.compile(r"\byou(?:r|rs)?\b", re.I)


def _matchable(text):
    """Text with code fences, quoted lines, and harness tags removed, lowercased."""
    out = _FENCED.sub(" ", text or "")
    out = _QUOTED_LINE.sub(" ", out)
    out = _TAG_BLOCK.sub(" ", out)
    return out.lower()


def _is_pasted(text):
    """True when the turn is the human pasting rather than the human speaking."""
    head = text.split("\n", 1)[0].strip()
    if _PASTED_HEAD.search(head):
        return True
    return len(text) > _PASTE_CHARS and not _SECOND_PERSON.search(text)


def _is_scannable(row):
    """True when the turn is real human input worth scanning for a correction."""
    if not row.get("human") or row.get("side") or row.get("kind") != "main":
        return False
    text = (row.get("text") or "").strip()
    if len(text) < 3 or text.startswith("/"):
        return False
    return not any(marker in row.get("text", "") for marker in _HARNESS_MARKERS)


def _pick_samples(values, n):
    """Shortest strings first, ties alphabetical: deterministic sample selection."""
    return [clip(s, 220) for s in sorted(set(values), key=lambda v: (len(v), v))[:n]]


def _correction_buckets(rows, top):
    """Correction buckets with counts and up to three verbatim samples each."""
    hits = {}
    for row in rows:
        text = _matchable(row.get("text", ""))
        for bucket, patterns in _COMPILED_THEMES:
            if not any(p.search(text) for p in patterns):
                continue
            hits.setdefault(bucket, []).append(collapse_ws(row.get("text", "")))
    buckets = [
        {"bucket": bucket, "count": len(samples), "samples": _pick_samples(samples, 3)}
        for bucket, samples in hits.items()
    ]
    return ranking(buckets, lambda b: b["count"], lambda b: b["bucket"], top)


def _request_key(text):
    """Cluster key for a request: significant words, deduped, sorted, first ten."""
    words = [
        w for w in _SPLIT_WS.split(_NON_WORD.sub(" ", _matchable(text)))
        if len(w) >= 3 and w not in _STOPWORDS
    ]
    uniq = sorted(set(words))
    return "" if len(uniq) < 4 else " ".join(uniq[:10])


def _repeated_requests(rows, top):
    """Near-duplicate human turns that appear in more than one session."""
    per = {}
    for row in rows:
        words = len((row.get("text") or "").strip().split())
        if words < 4 or words > 400:
            continue
        key = _request_key(row.get("text", ""))
        if key == "":
            continue
        entry = per.setdefault(key, {"texts": [], "sessions": set()})
        entry["texts"].append(collapse_ws(row.get("text", "")))
        entry["sessions"].add(row["sid"])
    clusters = []
    for entry in per.values():
        if len(entry["sessions"]) < 2:
            continue
        samples = _pick_samples(entry["texts"], 2)
        clusters.append({
            "label": (_pick_samples(entry["texts"], 1) or [""])[0],
            "count": len(entry["texts"]),
            "sessions": len(entry["sessions"]),
            "samples": samples,
        })
    return ranking(clusters, lambda c: c["sessions"], lambda c: c["label"], top)


def human_section(user_msgs, sessions, top):
    """Human turns, interrupts, corrections by theme, and requests made again."""
    human = [r for r in user_msgs if _is_scannable(r)]
    # The count is every human turn; the scans see only the ones the human wrote
    # rather than pasted, so one pasted agent report cannot fill a bucket.
    spoken = [r for r in human if not _is_pasted((r.get("text") or "").strip())]
    return {
        "humanTurnCount": len(human),
        "interrupts": int(total(sessions, lambda s: s.get("interrupts", 0))),
        "corrections": _correction_buckets(spoken, max(top, len(_THEMES))),
        "repeatedRequests": _repeated_requests(spoken, top),
    }


# Every bucket the correction scan can produce.
CORRECTION_BUCKETS = [bucket for bucket, _ in _THEMES]
