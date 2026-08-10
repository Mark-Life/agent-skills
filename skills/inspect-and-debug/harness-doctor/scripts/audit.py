#!/usr/bin/env python3
"""harness-doctor audit: fleet-wide mining of agent transcripts.

Mines the last N days of Claude Code transcripts under a projects root for
where wall-clock, tokens, and human corrections are wasted, and writes fact
tables plus a summary. Stdlib-only, Python 3.9+, cross-platform (no shelling
out to find/grep/du).

This is a mirror of audit.ts: identical CLI flags, identical camelCase fact
table field names, identical `--format json` report shape. The summary goes to
stdout, progress to stderr, and in `md` mode the last stdout line is the work
dir path unless `--no-tables` wrote nothing there. The fact tables contain real
prompts and command output; see SKILL.md.
"""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib import aggregate, cost, render, scan  # noqa: E402

_TABLE_FILES = (
    ("sessions", "sessions.jsonl"),
    ("tools", "tools.jsonl"),
    ("bash", "bash.jsonl"),
    ("userMsgs", "user-msgs.jsonl"),
    ("errors", "errors.jsonl"),
)


def _build_parser():
    p = argparse.ArgumentParser(prog="audit.py", description="harness-doctor fleet audit")
    p.add_argument("--days", type=int, default=30, help="window in days, default 30")
    p.add_argument("--root", default=None, help="transcripts root, default <home>/.claude/projects")
    p.add_argument("--out", default=None, help="work dir for fact tables, default <tmpdir>/harness-audit")
    p.add_argument("--project", action="append", default=None,
                   help="only project dirs containing this substring (repeatable)")
    p.add_argument("--format", choices=["md", "json"], default="md", help="stdout summary format, default md")
    p.add_argument("--top", type=int, default=15, help="rows per ranking, default 15")
    p.add_argument("--no-tables", action="store_true", help="compute aggregates without writing the fact tables")
    p.add_argument("--no-redact", action="store_true", help="disable secret redaction of text fields")
    p.add_argument("--pricing", default=None, help="JSON file overriding the built-in per-model price table")
    return p


def _write_table(out_dir, name, rows):
    """Write one fact table as JSONL, in scan order."""
    path = out_dir / name
    with open(path, "w", encoding="utf-8") as fh:
        for row in rows:
            # Separators match JSON.stringify, so both runtimes write the same bytes.
            fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
            fh.write("\n")
    return path


def main(argv=None):
    args = _build_parser().parse_args(argv)
    if args.days <= 0:
        print("--days needs a positive number, got %s" % args.days, file=sys.stderr)
        return 1

    root = Path(args.root) if args.root else Path.home() / ".claude" / "projects"
    out_dir = Path(args.out) if args.out else Path(tempfile.gettempdir()) / "harness-audit"
    redact_on = not args.no_redact

    try:
        pricing, overridden = cost.load_pricing(args.pricing)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print("error: could not load --pricing file: %s" % exc, file=sys.stderr)
        return 1
    if overridden:
        print("using pricing override from %s" % args.pricing, file=sys.stderr)

    print("scanning %s, last %d days" % (root, args.days), file=sys.stderr)
    sessions, tools, bash_rows, user_msgs, errors, stats = scan.scan_all(
        root, args.days, args.project, redact_on, progress_stream=sys.stderr,
    )
    if stats["filesScanned"] == 0:
        print(
            "No transcripts in the last %d days under %s. "
            "Check --root, widen --days, or drop --project." % (args.days, root),
            file=sys.stderr,
        )

    tables = {"sessions": sessions, "tools": tools, "bash": bash_rows,
              "userMsgs": user_msgs, "errors": errors}
    if not args.no_tables:
        out_dir.mkdir(parents=True, exist_ok=True)
        for key, name in _TABLE_FILES:
            _write_table(out_dir, name, tables[key])
        print("wrote %d fact tables to %s" % (len(_TABLE_FILES), out_dir), file=sys.stderr)
        print(
            "  the tables hold real prompts and command output, redacted best-effort: review before sharing"
            if redact_on
            else "  WARNING: redaction DISABLED (--no-redact): the tables hold raw prompts and secrets",
            file=sys.stderr,
        )

    report = aggregate.build(
        sessions, tools, bash_rows, user_msgs, errors, stats, args.days, pricing, args.top,
    )

    if args.format == "json":
        print(render.render_json(report))
        return 0
    sys.stdout.write(render.render_md(report, args.top) + "\n")
    # The work dir is only worth printing when something was written there.
    if not args.no_tables:
        print(str(out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
