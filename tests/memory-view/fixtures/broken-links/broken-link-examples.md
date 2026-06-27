---
name: broken-link-examples
description: "Reference note that intentionally contains broken outbound links for LNK01/LNK02 detector coverage"
metadata:
  node_type: memory
  type: reference
  originSessionId: 11111111-1111-4111-8111-111111111111
---

This note deliberately links to targets that do not resolve so the structural link checks have something to fire on.

A dangling wikilink with no near-match: [[does-not-exist]] — there is no file by this stem, and nothing close, so the only safe fix is removal (LNK01, tier B).

A dangling markdown link with no near-match: see [the missing page](missing.md) — `missing.md` is not on disk and has no candidate (LNK02, tier B).

A typo'd wikilink WITH a unique near-match: [[near-mtch]] — one edit away from the real [[near-match]] note, so fix-link can repair it automatically (LNK01, tier A).

The correctly spelled reference [[near-match]] resolves, keeping the repair target out of the orphan gutter.
