"""Render a clean-cut EDL: per-segment extract → concat → two-pass loudnorm.

Stdlib only. Needs ffmpeg + ffprobe on PATH.

usage: render.py <edl.json> -o <out.mp4> [--res 1080] [--fps 30] [--speed 1.1]
                 [--crf 20] [--workers 4] [--no-loudnorm]
"""
import argparse
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LONG_EDGE = {720: 1280, 1080: 1920, 1440: 2560, 2160: 3840}
LOUDNORM = "loudnorm=I=-14:TP=-1:LRA=11"


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"ffmpeg failed: {' '.join(cmd[:6])}...\n{r.stderr[-1500:]}")
    return r.stderr


def is_portrait(src):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height:stream_side_data=rotation", "-of", "json", str(src)],
        capture_output=True, text=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    rot = abs(int(next((d.get("rotation", 0) for d in s.get("side_data_list", [])), 0)))
    w, h = (s["height"], s["width"]) if rot in (90, 270) else (s["width"], s["height"])
    return h > w


def extract(src, start, dur, out, long_edge, portrait, fps, speed, crf):
    # Whole output frames, so audio and video of each segment end together.
    out_dur = max(1, round(dur / speed * fps)) / fps
    scale = f"scale=-2:{long_edge}" if portrait else f"scale={long_edge}:-2"
    vf = f"{scale},setpts=PTS/{speed}"
    # 30ms fades at both edges stop clicks at every seam.
    af = (f"afade=t=in:st=0:d=0.03,afade=t=out:st={max(0.0, dur - 0.03):.3f}:d=0.03,"
          f"atempo={speed},apad")
    run(["ffmpeg", "-y", "-ss", f"{start:.3f}", "-i", str(src), "-t", f"{dur:.3f}",
         "-vf", vf, "-af", af, "-c:v", "libx264", "-preset", "fast", "-crf", str(crf),
         "-pix_fmt", "yuv420p", "-r", str(fps), "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-t", f"{out_dur:.6f}", str(out)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("edl", type=Path)
    ap.add_argument("-o", "--output", type=Path, required=True)
    ap.add_argument("--res", type=int, default=1080, choices=sorted(LONG_EDGE))
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--speed", type=float, default=1.1)
    ap.add_argument("--crf", type=int, default=20)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--no-loudnorm", action="store_true")
    a = ap.parse_args()

    edl_path = a.edl.resolve()
    edit = edl_path.parent
    edl = json.loads(edl_path.read_text())
    srcs = {k: (edit / v).resolve() for k, v in edl["sources"].items()}
    portrait = {k: is_portrait(v) for k, v in srcs.items()}
    clips = edit / f"clips_{a.res}p"
    clips.mkdir(exist_ok=True)

    jobs = [(srcs[r["source"]], r["start"], r["end"] - r["start"], clips / f"seg_{i:04d}.mp4",
             LONG_EDGE[a.res], portrait[r["source"]], a.fps, a.speed, a.crf)
            for i, r in enumerate(edl["ranges"])]
    print(f"extracting {len(jobs)} segments at {a.res}p{a.fps}, {a.speed}x → {clips.name}/")
    with ThreadPoolExecutor(a.workers) as pool:
        list(pool.map(lambda j: extract(*j), jobs))

    # Video is stream-copied. Audio is re-encoded through aresample so AAC
    # priming in each segment cannot pile up into lip-sync drift.
    listing = edit / "_concat.txt"
    listing.write_text("".join(f"file '{j[3]}'\n" for j in jobs))
    out = a.output.resolve()
    base = out if a.no_loudnorm else out.with_suffix(".prenorm.mp4")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c:v", "copy",
         "-af", "aresample=async=1:first_pts=0", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
         "-movflags", "+faststart", str(base)])
    listing.unlink()

    if not a.no_loudnorm:
        log = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(base), "-vn",
                   "-af", f"{LOUDNORM}:print_format=json", "-f", "null", "-"])
        m = json.loads(re.findall(r"\{[^{}]+\}", log)[-1])
        print(f"loudness: {m['input_i']} LUFS → -14")
        af = (f"{LOUDNORM}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
              f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
              f"offset={m['target_offset']}:linear=true,aresample=48000")
        run(["ffmpeg", "-y", "-i", str(base), "-c:v", "copy", "-af", af,
             "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)])
        base.unlink()
    print(f"done: {out}")


main()
