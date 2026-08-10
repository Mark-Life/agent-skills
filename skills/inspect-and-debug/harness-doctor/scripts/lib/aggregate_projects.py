"""The `projects` section: per project, what it cost and what sits on disk.

The Python twin of `lib/aggregate-projects.ts`. This is the only part of the
aggregate that touches the filesystem. It reads package.json for the package
manager and the script NAMES: never their contents, and never any other file.
"""

import json
import os

from .aggregate_commands import command_families
from .stats import bump, group_by, ranking, round_to, top_key, total, uniq_sorted

# Lockfiles that name a package manager, checked in this order.
_LOCKFILES = (
    ("bun.lock", "bun"),
    ("bun.lockb", "bun"),
    ("pnpm-lock.yaml", "pnpm"),
    ("yarn.lock", "yarn"),
    ("package-lock.json", "npm"),
)


def probe_disk(cwd, check):
    """What sits on disk next to a project's cwd.

    A missing or unreadable directory yields all-false rather than an error.
    """
    base = {} if cwd is None else {"cwd": cwd}
    base.update({
        "claudeMd": False, "agentsMd": False, "settingsJson": False,
        "packageJson": False, "scriptNames": [],
    })
    if not cwd or not check or not os.path.isdir(cwd):
        return base
    pkg_path = os.path.join(cwd, "package.json")
    out = dict(base)
    out.update({
        "claudeMd": os.path.exists(os.path.join(cwd, "CLAUDE.md")),
        "agentsMd": os.path.exists(os.path.join(cwd, "AGENTS.md")),
        "settingsJson": os.path.exists(os.path.join(cwd, ".claude", "settings.json")),
        "packageJson": os.path.exists(pkg_path),
    })
    if not out["packageJson"]:
        return out
    try:
        with open(pkg_path, "r", encoding="utf-8") as fh:
            pkg = json.load(fh)
    except (OSError, ValueError):
        return out
    if not isinstance(pkg, dict):
        return out
    declared = pkg.get("packageManager")
    manager = declared.split("@")[0] if isinstance(declared, str) and declared else None
    if not manager:
        for name, tool in _LOCKFILES:
            if os.path.exists(os.path.join(cwd, name)):
                manager = tool
                break
    scripts = pkg.get("scripts")
    if manager:
        out["packageManager"] = manager
    out["scriptNames"] = uniq_sorted(scripts.keys()) if isinstance(scripts, dict) else []
    return out


def projects_section(sessions, bash, top, check_disk, totals_of, cost_of):
    """Per project: sessions, tokens, cost, bash seconds, top families, disk."""
    bash_by_proj = group_by(bash, lambda b: b.get("proj", ""))
    rows = []
    for proj, group in group_by(sessions, lambda s: s["proj"]).items():
        cwds = {}
        for s in group:
            if s.get("cwd"):
                bump(cwds, s["cwd"])
        proj_bash = bash_by_proj.get(proj, [])
        families = command_families(proj_bash)
        rows.append({
            "proj": proj,
            "sessions": len(group),
            "totals": totals_of(group),
            "estCostUsd": round_to(cost_of(group), 4),
            "bashSec": round_to(total(proj_bash, lambda b: b.get("durSec") or 0), 1),
            "topCommands": ranking(families, lambda f: f["totalSec"], lambda f: f["family"], 5)["rows"],
            "onDisk": probe_disk(top_key(cwds) if cwds else None, check_disk),
        })
    return ranking(rows, lambda r: sum(r["totals"].values()), lambda r: r["proj"], top)
