---
name: clean-cut
description: Tighten a talking or screen-recorded video without changing its content. Cuts filler sounds (um, uh, э-э-э), throat clears, clicks and dead air, speeds up 1.1x, renders a 1080p30 preview and then a 4K final. Use when the user asks to clean up, tighten, de-um, or "cut the pauses" in a recording, in any language. Builds on the video-use skill.
version: 1.0.0
---

# Clean Cut

A **clean cut** keeps every spoken word and removes only the non-content between words: hesitation sounds, audio events, and dead air. The viewer should not notice an edit happened, only that the video is shorter and tighter.

This skill is a style layer on top of `video-use` (`~/.agents/skills/video-use/SKILL.md`, source: [browser-use/video-use](https://github.com/browser-use/video-use)). Read its SKILL.md first: its Hard Rules apply here unchanged. `video-use` provides transcription and visual checks. This skill decides *what* to cut and ships its own cut builder and renderer.

## Defaults

| Setting | Value |
|---|---|
| Content | every word kept, no sections removed, no reordering |
| Cut | fillers, audio events, silences ≥ 0.4s |
| Pause left after a cut | ~0.27s source (≈0.25s at 1.1x) |
| Pause when the screen changes during silence | ~0.8s, so the viewer sees the change |
| Word parasites (`like`, `you know`, `как бы`, `вот`) | kept: removing them risks changing meaning. Offer as an option in the report |
| Speed | 1.1x, pitch preserved (`atempo`) |
| Frame rate | 30 fps |
| Loudness | two-pass loudnorm to -14 LUFS (screen recordings are often ~-29 LUFS) |
| Grade, subtitles, overlays | none |
| Iteration | 1080p30 preview first → user approves → 4K30 final with the same EDL |
| Source file | never modified; all output in `<videos_dir>/edit/` |

The user already stated this strategy by invoking the skill. Confirm only the unknowns: content type (screen recording or talking head) and language if unclear. Then execute without a separate strategy round.

## Setup

- `VU` = the video-use repo root: `$(dirname "$(readlink -f ~/.agents/skills/video-use/SKILL.md)")`. `H` = `$VU/helpers`.
- `PY` = video-use's Python with its deps (`$VU/.venv/bin/python` after `uv sync`). This skill's own scripts are stdlib-only and run with any `python3`.
- `CC` = this skill's folder. `E` = `<videos_dir>/edit`. `SRC` = the source video.
- ElevenLabs key: `ELEVENLABS_API_KEY` in the environment or `$VU/.env`. The key needs the **Speech to Text** permission. A 401 with `missing_permissions` means the key exists but that toggle is off: the user enables it in ElevenLabs → Developers → API Keys.

## Pipeline

### 1. Transcribe (word-level, with language code)

```bash
$PY $H/transcribe.py "$SRC" --language <iso> --edit-dir "$E"
$PY $H/pack_transcripts.py --edit-dir "$E"
```

Pass `--language` explicitly (`en`, `ru`, `de`, ...). Scribe keeps fillers verbatim (`um`, `uh`, `э-э-э`, `м-м-м`) and tags events (`[clears throat]`, `[laughs]`, `[typing]`). Those tokens are the whole editing signal, so a transcriber that normalizes fillers away (local Whisper) cannot do this job. A 17 min video transcribes in ~20s.

### 2. Proxy + static-screen detection in one decode pass

4K60 decode is the slowest step (~10 min per 17 min of source). Decode the source once, in the background, while step 1 runs:

```bash
ffmpeg -hide_banner -nostats -y -i "$SRC" -filter_complex \
 "[0:v]scale=1920:-2:flags=lanczos,fps=30,split[p][f];\
  [f]scale=640:-2,fps=10,freezedetect=n=-50dB:d=0.3,metadata=mode=print:file=$E/freeze.txt,nullsink" \
 -map "[p]" -map 0:a -c:v libx264 -preset veryfast -crf 14 -g 15 -pix_fmt yuv420p \
 -c:a pcm_s16le "$E/proxy_1080p30.mov"
```

- `proxy_1080p30.mov` has the same timeline as the source. Its short GOP (`-g 15`) makes each segment seek cheap.
- `freeze.txt` lists intervals where the screen is static. A silence *not* fully inside a freeze interval means something moves on screen: typing, output streaming, scrolling. Skip `freeze.txt` for talking-head footage.
- For a portrait source, use `scale=-2:1920` in both places.

### 3. Build the cut list

```bash
python3 $CC/scripts/build_edl.py --edit-dir "$E" --transcript <name>.json \
  --source proxy_1080p30.mov --freeze freeze.txt --speed 1.1
```

Rules the script applies (tune with flags; the defaults are the approved style):

- **Filler** = any `audio_event`, a token matching the language's hesitation pattern (`FILLERS` dict: en, ru, de, es, fr), or any letter stretched with hyphens (`a-a-a`, `э-э-э`, a `з-з--` stutter). English patterns always apply as a fallback. For a new language, add its hesitation sounds to `FILLERS` or pass `--extra-fillers 'tok1,tok2'`.
- **Cut** between two kept words when a filler sits between them, or when the silence is ≥ `--min-gap` (0.4s).
- **Keep** `--pad-out` 0.15s after the last word and `--pad-in` 0.12s before the next one. On an active screen, keep 0.45s and 0.35s.
- **Filler guard**: padding stops 20ms short of a removed filler, with a 30ms floor, so a sliver of "uh" never leaks back in.
- Cut windows under 0.12s are skipped: they are mid-phrase and not worth a seam.
- Head: 0.3s before the first word. Tail: 0.6s after the last word.

Read `cuts_log.json` before rendering:
- Tally the `removed` values. Every entry must be a filler or an event. A real word there means a pattern is too greedy: fix the regex and rebuild.
- Tokens stretched without hyphens (`sooo`, `иии`) stay on purpose: they carry a real word.

Reference result: 17.4 min → 12.9 min (283 cuts, 140 of them fillers, 25 on an active screen).

### 4. Render the preview (1080p30, 1.1x)

```bash
python3 $CC/scripts/render.py "$E/edl.json" -o "$E/preview_1080p.mp4" --res 1080 --fps 30 --speed 1.1
```

`render.py` extracts segments in parallel (`--workers 4`). Each segment gets `setpts` + `atempo` for speed and 30ms fades at both edges, and is snapped to whole frames. Then it concats with video stream-copied and audio resampled against drift, and runs two-pass loudnorm. 284 segments from the proxy render in ~4 min.

### 5. Self-check

- `ffprobe` the output: video and audio stream durations must be equal. Expect ~13ms per cut over the EDL estimate (concat rounds to AAC frames; 3.7s over 284 cuts). A/V stays in sync.
- `$PY $H/timeline_view.py <out> <start> <end> -o $E/verify/<name>.png` at the start, a midpoint, the last 6s, and one dense cut region. Look for waveform spikes at seams.
- The tail must end on silence, not mid-word: `ffmpeg -ss <dur-0.4> -i <out> -af volumedetect -f null -` → `max_volume` far below speech (≈ -50 dB).

### 6. Final (after the user approves the preview)

Point the same EDL at the original source. Cut times stay valid because the proxy shares the source timeline.

```bash
python3 -c "import json,sys;e=json.load(open(sys.argv[1]));e['sources']['S']=sys.argv[2];json.dump(e,open(sys.argv[3],'w'),indent=1,ensure_ascii=False)" \
  "$E/edl.json" "$SRC" "$E/edl_4k.json"
python3 $CC/scripts/render.py "$E/edl_4k.json" -o "$E/final_4k.mp4" --res 2160 --fps 30 --speed 1.1
```

Expect ~9 min for a 13 min output. `final_4k.mp4` duration must equal the preview's.

### 7. Persist

Append the session to `$E/project.md` (format in video-use). Record the numbers (cuts, fillers, runtime before and after), the kept parasites, and the render commands.

## Report to the user

Lead with the output path and the runtime change (before → after). Then cover what was removed (filler count, pause rule), what was kept on purpose (parasites, with counts), and the loudness change. Say what was verified and what was not: spot checks are not a full watch. End with cleanup candidates: `proxy_1080p30.mov`, `clips_*p/`.
