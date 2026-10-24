# Motion schematic

Read [`SKILL.md`](SKILL.md) first — it decides whether a body carries a picture.
This file owns the one picture a screenshot cannot give: a short looping GIF of
what the change *does*. A reader watches it once and holds the idea of the PR.

It is an illustration, never a promo: a diagram that moves.

## When

Draw one only when the motion itself carries information: the reader must see
something happen over time — what re-renders, what re-parses or refetches, how
data or control flows, what runs in what order — and no real capture shows it.
A real capture wins over a schematic: react-scan outlines, a profiler flame
chart, terminal output, or a before/after table of numbers. A localized fix, a
rename, a static shape change, or a change a screenshot or table already shows
gets no schematic.

A request to "add motion" is a request to show the mechanism, not to draw this
file's default layout. If the honest picture is one diagram, one column, or no
GIF, make that.

## Shape

These are defaults, not a template. Every element earns its place by showing
something the others do not; drop the ones that do not.

- **Two columns, one clock.** Before on the left, after on the right, the same
  input playing through both at once. A feature with no before is one column.
- **A metric strip only when the number moves with the input.** A cost that
  grows per step against one that stays flat earns a strip on top of each
  column, both on the same scale. A fixed ratio, a count that never changes, or
  a number already in the body's table gets no strip: the flashing parts carry
  the message.
- **Wireframe.** Grey bars for text, plain boxes for components. Flash a
  part when it does work: red in before, green in after. Idle parts stay grey.
- **Pure black, neutral greys, red and green only.** No tints, gradients, grids,
  or logos.
- **Headers and part labels are the only text.** Name a part in 1–3 words
  ("main thread", "worker", "client", "database") when its shape alone does not
  say what it is — at most about four a column. Sentences and captions belong in
  the body; the GIF shows.
- **Labels stay quiet.** Muted grey, smaller than the column headers, beside the
  part or at the start of its lane. A one-line legend is fine when colour alone
  carries a meaning.
- **Faithful direction, schematic shapes.** The ratio between the columns
  follows the PR's real numbers; the exact figures stay in the body.
- **About 6 seconds**, one pass with a short fade, 1080 CSS px square rendered at
  2x.

## Build

1. Write one HTML file whose `window.renderAt(t)` rebuilds the whole frame from
   `t` alone — no CSS animations, timers, or clock reads. Every frame is then
   reproducible and scrubbable.
2. Render 3–4 stills, stack them into one contact sheet, and look at it. Iterate
   on stills; render the full run only once they read right.
3. Capture frames with Playwright:

   ```ts
   const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 2 });
   await page.goto(`file://${htmlPath}`);
   await page.evaluate(() => document.fonts.ready);
   for (let i = 0; i < seconds * 30; i++) {
     await page.evaluate((t) => (window as any).renderAt(t), i / 30);
     await page.screenshot({ path: `frames/f${String(i).padStart(5, "0")}.png` });
   }
   ```

4. Encode the GIF straight from the PNG frames. Flat colour on black lands near
   2 MB at 2160 px:

   ```bash
   ffmpeg -framerate 30 -i frames/f%05d.png \
     -vf "fps=25,split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=none" \
     schematic.gif
   ```

## Publish

Upload with `gh` ≥ 2.101: reference the file in the body as
`![<what it shows>](./schematic.gif)` and pass `--attach ./schematic.gif` to
`gh pr create`, `gh pr edit`, `gh issue create`, or `gh issue edit`. `gh`
rewrites the path to a `github.com/user-attachments/assets/…` URL. That URL
embeds in any repo's PR, including an upstream you cannot upload to.

Done when a frame pulled back out of the GIF shows both columns legible, and the
attachment URL returns `200` without credentials — it can return `404` for about
a minute after upload, so poll:

```bash
curl -sSL -o /dev/null -w '%{http_code}\n' "<attachment-url>"
```
