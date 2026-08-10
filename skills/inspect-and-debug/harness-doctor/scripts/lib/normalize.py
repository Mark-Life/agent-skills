"""Command-family normalisation and error-signature clustering.

The Python twin of `lib/normalize.ts`, rule for rule: a command is split into
top-level segments on `&&`, `||`, `;`, a pipe, or a newline, the first segment
that does real work is picked, wrappers such as `sudo`, `npx`, and `pnpm dlx`
are unwrapped, and only then does the leading token name the family. Anything
looser makes `cd x && real-cmd` report `cd`.
"""

import re

_HARNESS_MARKERS = (
    "<task-notification>",
    "<system-reminder>",
    "<command-name>",
    "[Request interrupted",
)

# Segments that set up a shell but do no work, so never name a family.
_SETUP_BINS = frozenset([
    "cd", "pushd", "popd", "set", "export", "unset", "source", ".", "alias",
    "shopt", "umask", "trap", "true", "exec",
])

# Wrappers that stand in front of the real command.
_UNARY_WRAPPERS = frozenset(["sudo", "command", "time", "nohup", "env", "npx", "bunx", "pnpx", "stdbuf"])

# Two-word wrappers: `<bin> <word>` runs the next word as the real command.
_BINARY_WRAPPERS = {
    "pnpm": frozenset(["dlx", "exec"]),
    "yarn": frozenset(["dlx"]),
    "npm": frozenset(["exec", "x"]),
    "bun": frozenset(["x"]),
}

# Binaries whose first path argument is a script worth keeping in the family.
_SCRIPT_RUNNERS = frozenset([
    "node", "bun", "deno", "python", "python3", "py", "tsx", "ts-node", "sh",
    "bash", "zsh", "fish", "ruby", "perl", "php", "uv", "uvx", "poetry",
])

# Words after which the next bare word is the script or task name.
_RUN_WORDS = frozenset(["run", "run-script", "exec", "test", "dlx", "x", "workspace", "task"])

# Max family words kept after the binary.
_FAMILY_BUDGET = 3

_HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$", re.M)
_FLAG = re.compile(r"^-{1,2}[^-\s]")
_REDIRECT = re.compile(r"^(?:\d?(?:>>|>|<<<|<<|<)|&>>?)")
_ENV_ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
_FLAG_WITH_VALUE = re.compile(r"^-{1,2}[^-\s]+=")
_EXT = re.compile(r"\.[A-Za-z0-9]{1,6}$")
_WS = re.compile(r"\s")
_NUMBER = re.compile(r"^\d+([.,:]\d+)*$")
_HEXISH = re.compile(r"^[0-9a-f]{7,}$", re.I)
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_URL = re.compile(r"^[a-z][a-z0-9+.-]*://", re.I)
_SPLIT_PATH = re.compile(r"[\\/]")
_EXE = re.compile(r"\.exe$", re.I)


def _strip_heredocs(cmd):
    """Replace heredoc bodies with a marker so their contents never reach a family."""
    return _HEREDOC.sub("<<HEREDOC", cmd or "")


def split_segments(cmd):
    """Split on `&&`, `||`, `;`, a pipe, or a newline, quotes and `$(...)` aside.

    Returns (segments, background).
    """
    segments = []
    buf = []
    single = double = backtick = False
    depth = 0
    background = False

    def push():
        text = "".join(buf).strip()
        if text:
            segments.append(text)
        del buf[:]

    i = 0
    n = len(cmd)
    while i < n:
        c = cmd[i]
        nxt = cmd[i + 1] if i + 1 < n else ""
        prev = cmd[i - 1] if i > 0 else ""
        if c == "\\" and not single:
            buf.append(c + nxt)
            i += 2
            continue
        if c == "'" and not double and not backtick:
            single = not single
            buf.append(c)
            i += 1
            continue
        if c == '"' and not single:
            double = not double
            buf.append(c)
            i += 1
            continue
        if single or double:
            buf.append(c)
            i += 1
            continue
        if c == "`":
            backtick = not backtick
            buf.append(c)
            i += 1
            continue
        if c == "(":
            depth += 1
            buf.append(c)
            i += 1
            continue
        if c == ")":
            depth = max(0, depth - 1)
            buf.append(c)
            i += 1
            continue
        if depth > 0 or backtick:
            buf.append(c)
            i += 1
            continue
        if (c == "&" and nxt == "&") or (c == "|" and nxt == "|"):
            push()
            i += 2
            continue
        if c in ("|", ";", "\n"):
            push()
            i += 1
            continue
        if c == "&" and prev != ">" and nxt != ">":
            background = True
            push()
            i += 1
            continue
        buf.append(c)
        i += 1
    push()
    return segments, background


def tokenize(segment):
    """Split one segment into (text, quoted) words, keeping `$(...)` whole."""
    words = []
    buf = []
    quoted = False
    single = double = False
    depth = 0

    def push():
        nonlocal quoted
        if buf:
            words.append((("".join(buf)), quoted))
        del buf[:]
        quoted = False

    i = 0
    n = len(segment)
    while i < n:
        c = segment[i]
        if c == "\\":
            if i + 1 < n:
                buf.append(segment[i + 1])
            i += 2
            continue
        if c == "'" and not double:
            single = not single
            quoted = True
            i += 1
            continue
        if c == '"' and not single:
            double = not double
            quoted = True
            i += 1
            continue
        if not single and not double:
            if c == "(" or (c == "$" and i + 1 < n and segment[i + 1] == "("):
                depth += 1
            if c == ")":
                depth = max(0, depth - 1)
            if _WS.match(c) and depth == 0:
                push()
                i += 1
                continue
        buf.append(c)
        i += 1
    push()
    return words


def _is_flag(w):
    return bool(_FLAG.match(w)) or w == "--"


def _is_path_like(w):
    return "/" in w or "\\" in w or w.startswith("~") or w.startswith(".") or bool(_EXT.search(w))


def _is_literal(w):
    return bool(
        _NUMBER.match(w)
        or _HEXISH.match(w)
        or _UUID.match(w)
        or _URL.match(w)
        or w.startswith("$")
        or w.startswith("<<")
    )


def _bin_name(w):
    base = _SPLIT_PATH.split(w)[-1] or w
    return _EXE.sub("", base)


def _meaningful_segment(segments):
    """First segment that does real work, else the first one."""
    for s in segments:
        words = [w for w in tokenize(s) if not _ENV_ASSIGN.match(w[0])]
        if not words:
            continue
        if _bin_name(words[0][0]) in _SETUP_BINS:
            continue
        return s
    return segments[0] if segments else ""


def _unwrap(words):
    """Drop leading env assignments and wrapper binaries."""
    ws = list(words)
    while ws and _ENV_ASSIGN.match(ws[0][0]):
        ws = ws[1:]
    for _ in range(4):
        if not ws:
            break
        head = _bin_name(ws[0][0])
        if head in _UNARY_WRAPPERS:
            ws = ws[1:]
            while ws and (_ENV_ASSIGN.match(ws[0][0]) or _is_flag(ws[0][0])):
                ws = ws[1:]
            continue
        second = _bin_name(ws[1][0]) if len(ws) > 1 else ""
        if second in _BINARY_WRAPPERS.get(head, ()):
            ws = ws[2:]
            continue
        break
    return ws


def normalize_command(raw):
    """Reduce a shell command to family, bin, distinctness key, chain, background.

    Returns a dict with family, bin, normalized, chainLength, background. Safe on
    any input: an unparseable command yields its first word as bin and family.
    """
    cmd = _strip_heredocs(raw or "")
    segments, background = split_segments(cmd)
    primary = _meaningful_segment(segments)
    words = _unwrap(tokenize(primary))
    binname = _bin_name(words[0][0]) if words else ""

    kept = []
    saw_script = False
    saw_operand = False
    pending_flag_value = False
    pending_redirect_target = False
    for text, quoted in words[1:]:
        if len(kept) >= _FAMILY_BUDGET:
            break
        redirect = _REDIRECT.match(text)
        if redirect:
            # `2>&1` carries its own target; a bare `>` swallows the next word.
            pending_redirect_target = len(redirect.group(0)) == len(text)
            pending_flag_value = False
            continue
        if pending_redirect_target:
            pending_redirect_target = False
            continue
        if _is_flag(text):
            pending_flag_value = "=" not in text and text != "--"
            continue
        if text in ("-", "--"):
            continue
        script_slot = binname in _SCRIPT_RUNNERS or (bool(kept) and kept[-1] in _RUN_WORDS)
        if _is_path_like(text) and not quoted:
            # A script path names the work; any other path is just an argument.
            if script_slot and not saw_script:
                base = _EXT.sub("", _SPLIT_PATH.split(text)[-1] or text)
                if base and not _is_literal(base):
                    kept.append(base)
                    saw_script = True
            saw_operand = True
            pending_flag_value = False
            continue
        if pending_flag_value:
            pending_flag_value = False
            continue
        if quoted or _is_literal(text) or _ENV_ASSIGN.match(text):
            # A pattern or a literal ends the subcommand run: operands follow.
            saw_operand = True
            continue
        if saw_operand:
            continue
        kept.append(text)
        if script_slot:
            saw_script = True

    family = " ".join([w for w in [binname] + kept if w])
    if not family:
        head = (raw or "").strip().split()
        family = head[0] if head else ""
    return {
        "family": family,
        "bin": binname,
        "normalized": normalize_command_text(cmd, segments),
        "chainLength": len(segments),
        "background": background,
    }


def normalize_command_text(raw, presplit=None):
    """Mask the varying literals in a command, keeping flags and bare words."""
    segments = presplit if presplit is not None else split_segments(_strip_heredocs(raw or ""))[0]
    out = []
    for segment in segments:
        masked = []
        for text, quoted in tokenize(segment):
            if quoted:
                masked.append("<str>")
            elif _ENV_ASSIGN.match(text):
                masked.append(text.split("=")[0] + "=<v>")
            elif _FLAG_WITH_VALUE.match(text):
                masked.append(text.split("=")[0] + "=<v>")
            elif _is_flag(text):
                masked.append(text)
            elif _is_literal(text):
                masked.append("<lit>")
            elif _is_path_like(text):
                masked.append("<path>")
            else:
                masked.append(text)
        out.append(" ".join(masked))
    return " ; ".join(out)[:400]


def base_binary(raw):
    """Base binary of a command, wrappers and paths stripped."""
    return normalize_command(raw)["bin"]


def command_family(raw):
    """Normalised command family of a command."""
    return normalize_command(raw)["family"]


_SIG_URL = re.compile(r"[a-z][a-z0-9+.-]*://\S+", re.I)
_SIG_STR = re.compile(r"'[^']*'|\"[^\"]*\"|`[^`]*`")
_SIG_UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)
_SIG_PATH = re.compile(r"(?:[A-Za-z]:)?(?:[\w.@~+-]*[\\/])+[\w.@+-]*")
_SIG_HASH = re.compile(r"\b[0-9a-f]{7,}\b", re.I)
_SIG_NUM = re.compile(r"\b\d+(?:[.,]\d+)*\b")
_SIG_WS = re.compile(r"\s+")


def normalize_sig(msg):
    """Cluster key for an error message: two lead lines, literals masked."""
    if not msg:
        return ""
    head = " ".join([line for line in msg.split("\n") if line.strip()][:2])
    out = _SIG_URL.sub("<url>", head)
    out = _SIG_STR.sub("<str>", out)
    out = _SIG_UUID.sub("<uuid>", out)
    out = _SIG_PATH.sub("<path>", out)
    out = _SIG_HASH.sub("<hash>", out)
    out = _SIG_NUM.sub("<n>", out)
    return _SIG_WS.sub(" ", out).strip()[:200]


# Harness-generated wrappers that are not human input.
_HARNESS_BLOCKS = [
    re.compile(r"<system-reminder>[\s\S]*?</system-reminder>"),
    re.compile(r"<task-notification>[\s\S]*?</task-notification>"),
    re.compile(r"<command-name>[\s\S]*?</command-name>"),
    re.compile(r"<command-message>[\s\S]*?</command-message>"),
    re.compile(r"<command-args>[\s\S]*?</command-args>"),
    re.compile(r"<local-command-stdout>[\s\S]*?</local-command-stdout>"),
    re.compile(r"<local-command-stderr>[\s\S]*?</local-command-stderr>"),
]

# Openers that mark a turn as machine-generated even when unclosed.
_HARNESS_PREFIX = re.compile(
    r"^(?:\[Request interrupted|<system-reminder|<task-notification|<command-name"
    r"|<command-message|<command-args|<local-command|Caveat: The messages below"
    r"|API Error|\[Tool result)"
)


def strip_harness(text):
    """Strip harness-generated blocks so a correction scan sees human words."""
    out = text or ""
    for pattern in _HARNESS_BLOCKS:
        out = pattern.sub(" ", out)
    return out.strip()


def is_human_text(stripped, kind, side, is_meta):
    """True when a user turn is real human input, not a harness echo."""
    if kind != "main" or side or is_meta:
        return False
    if not stripped:
        return False
    return not _HARNESS_PREFIX.match(stripped)
