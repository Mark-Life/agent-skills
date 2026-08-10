"""Row shapes for the harness-doctor fact tables.

These TypedDicts mirror lib/types.ts field for field (same camelCase names) so
that sessions.jsonl, tools.jsonl, bash.jsonl, user-msgs.jsonl and errors.jsonl
are interchangeable between the TypeScript and Python implementations. Fields
are optional (total=False) because an absent value is omitted from the row
entirely, never written as null.
"""

from typing import Dict, Literal, TypedDict

SessionKind = Literal["main", "subagent", "workflow-agent"]


class SessionRow(TypedDict, total=False):
    """One transcript file, summarised."""

    sid: str
    proj: str
    file: str
    bytes: int
    cwd: str
    branch: str
    ver: str
    start: int
    end: int
    kind: SessionKind
    parent: str
    run: str
    assistantMsgs: int
    userMsgs: int
    inTokens: int
    outTokens: int
    cacheReadTokens: int
    cacheCreateTokens: int
    maxCtx: int
    firstTurnCacheCreate: int
    models: Dict[str, int]
    tools: Dict[str, int]
    interrupts: int
    errors: int


class ToolRow(TypedDict, total=False):
    """One tool call joined to its result."""

    sid: str
    proj: str
    kind: SessionKind
    t: int
    tool: str
    durSec: float
    err: bool
    outChars: int
    arg: str
    side: bool


class BashRow(TypedDict, total=False):
    """One Bash call. Same joined shape as ToolRow, plus the command."""

    sid: str
    proj: str
    kind: SessionKind
    t: int
    durSec: float
    err: bool
    outChars: int
    side: bool
    cmd: str
    desc: str
    family: str
    bin: str
    bg: bool
    out: str


class UserMsgRow(TypedDict, total=False):
    """One human-visible user turn."""

    sid: str
    proj: str
    kind: SessionKind
    t: int
    text: str
    side: bool
    human: bool


class ErrorRow(TypedDict, total=False):
    """One errored tool result."""

    sid: str
    proj: str
    kind: SessionKind
    t: int
    tool: str
    input: str
    msg: str
    sig: str
