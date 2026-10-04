# Motion schematic

Read [`SKILL.md`](SKILL.md) first — it decides whether a body carries a picture.
This file owns the one picture a screenshot cannot give: a short looping GIF of
what the change *does*. A reader watches it once and holds the idea of the PR.

It is an illustration, never a promo: a diagram that moves.

## When

Draw one when the change is a mechanism the reader would otherwise rebuild from
prose: what re-renders, what re-parses or refetches, how data or control flows,
how a schema or state shape changes, what runs in what order. A localized fix, a
rename, or a change a screenshot already shows gets no schematic.

## Shape

- **Two columns, one clock.** Before on the left, after on the right, the same
  input playing through both at once. A feature with no before is one column.
- **Metric strip on top of each column**, both on the same scale: the cost per
  step, or a running count. A ramp against a flat line is the whole message.
- **Wireframe below.** Grey bars for text, plain boxes for components. Flash a
  part when it does work: red in before, green in after. Idle parts stay grey.
- **Pure black, neutral greys, red and green only.** No tints, gradients, grids,
  or logos.
- **Column headers are the only text.** The body explains; the GIF shows.
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
