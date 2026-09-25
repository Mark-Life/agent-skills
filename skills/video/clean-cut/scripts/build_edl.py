"""Build a clean-cut EDL: drop filler sounds and audio events, shrink silences.

Every spoken word stays. Output: <edit>/edl.json + <edit>/cuts_log.json.

usage: build_edl.py --edit-dir <edit> --transcript <name>.json --source <video>
                    [--freeze freeze.txt] [--speed 1.1] [--extra-fillers 'ну,типа']
"""
import argparse
import json
import re
from pathlib import Path

# Hesitation sounds per language, matched on the lowercased, punctuation-stripped token.
FILLERS = {
    "en": r"u+h+|u+m+|u+h+m+|e+r+m*|a+h+|h+m+|m+h*m+|e+h+",
    "ru": r"э+|а-а+(-а+)*|м+|хм+|е-?е+|эм+|ам+",
    "de": r"ä+h+m*|ö+h+m*|h+m+|m+",
    "es": r"e+h+|e+m+|m+|mmm+",
    "fr": r"eu+h+|b+e+h+|h+m+|m+",
}
# Any language: one letter stretched with hyphens ("э-э-э", "a-a-a", "m-m-m").
STRETCHED = r"([^\W\d_])\1*(-\1+)+"

ap = argparse.ArgumentParser()
ap.add_argument("--edit-dir", type=Path, required=True)
ap.add_argument("--transcript", required=True, help="file name inside <edit>/transcripts/")
ap.add_argument("--source", required=True, help="video path for the EDL, relative to edit dir or absolute")
ap.add_argument("--freeze", default=None, help="freezedetect metadata file from the proxy pass")
ap.add_argument("--speed", type=float, default=1.1, help="only used for the runtime estimate")
ap.add_argument("--extra-fillers", default="", help="comma-separated extra tokens to cut")
ap.add_argument("--min-gap", type=float, default=0.4, help="silences at or above this get shrunk")
ap.add_argument("--pad-out", type=float, default=0.15, help="silence kept after the last word before a cut")
ap.add_argument("--pad-in", type=float, default=0.12, help="silence kept before the first word after a cut")
ap.add_argument("--act-out", type=float, default=0.45, help="pad-out when the screen changes during the pause")
ap.add_argument("--act-in", type=float, default=0.35, help="pad-in when the screen changes during the pause")
a = ap.parse_args()

E = a.edit_dir
d = json.loads((E / "transcripts" / a.transcript).read_text())
lang = (d.get("language_code") or "").lower()[:2]
extra = {t.strip().lower() for t in a.extra_fillers.split(",") if t.strip()}
filler_res = [re.compile(r) for r in filter(None, [FILLERS.get(lang), FILLERS["en"], STRETCHED])]

norm = lambda t: re.sub(r"[^\w-]", "", t.lower()).strip("-")
is_filler = lambda x: x["type"] == "audio_event" or norm(x["text"]) in extra or any(r.fullmatch(norm(x["text"])) for r in filler_res)

freeze: list[tuple[float, float]] = []
if a.freeze:
    s = None
    for line in (E / a.freeze).read_text().splitlines():
        if "freeze_start" in line:
            s = float(line.split("=")[1])
        elif "freeze_end" in line and s is not None:
            freeze.append((s, float(line.split("=")[1])))
            s = None
    if s is not None:
        freeze.append((s, 1e9))
static = lambda t0, t1: not a.freeze or any(s <= t0 + 0.05 and e >= t1 - 0.05 for s, e in freeze)

toks = [x for x in d["words"] if x["type"] != "spacing"]
kept = [i for i, x in enumerate(toks) if not is_filler(x)]
cuts, log = [], []
for i, j in zip(kept, kept[1:]):
    A, B, mid = toks[i], toks[j], toks[i + 1 : j]
    gap = B["start"] - A["end"]
    if not mid and gap < a.min_gap:
        continue
    active = not static(A["end"], B["start"])
    po, pi = (a.act_out, a.act_in) if active else (a.pad_out, a.pad_in)
    if mid:  # never let padding reach back into the removed filler
        po = min(po, max(0.03, mid[0]["start"] - A["end"] - 0.02))
        pi = min(pi, max(0.03, B["start"] - mid[-1]["end"] - 0.02))
    cs, ce = A["end"] + po, B["start"] - pi
    if ce - cs < 0.12:
        continue
    cuts.append((cs, ce))
    log.append(dict(t=round(A["end"], 2), gap=round(gap, 2), cut=round(ce - cs, 2), active=active,
                    removed=" ".join(x["text"] for x in mid), ctx=f"{A['text']} | {B['text']}"))

start = max(0.0, toks[kept[0]]["start"] - 0.3)
end = min(d["audio_duration_secs"] - 0.05, toks[kept[-1]]["end"] + 0.6)
ranges, cur = [], start
for cs, ce in cuts:
    ranges.append(dict(source="S", start=round(cur, 3), end=round(cs, 3)))
    cur = ce
ranges.append(dict(source="S", start=round(cur, 3), end=round(end, 3)))

kept_s = sum(r["end"] - r["start"] for r in ranges)
edl = dict(version=1, sources={"S": a.source}, ranges=ranges, grade="none", overlays=[],
           total_duration_s=round(kept_s / a.speed, 2))
(E / "edl.json").write_text(json.dumps(edl, indent=1, ensure_ascii=False))
(E / "cuts_log.json").write_text(json.dumps(log, indent=1, ensure_ascii=False))

n_fill = sum(1 for x in log if x["removed"])
print(f"lang={lang or '?'} segments={len(ranges)} cuts={len(cuts)} filler_cuts={n_fill} "
      f"active_screen={sum(x['active'] for x in log)} source={d['audio_duration_secs'] / 60:.2f}min "
      f"kept={kept_s / 60:.2f}min at{a.speed}x={kept_s / a.speed / 60:.2f}min")
