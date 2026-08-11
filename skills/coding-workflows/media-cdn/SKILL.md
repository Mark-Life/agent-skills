---
name: media-cdn
description: "Use for public file uploading: when a screenshot, GIF, or video has to be embedded in a PR, issue, doc, or message."
version: 1.0.0
---

# Media CDN

`scripts/cdn.ts` covers every asset operation the service exposes: a private object store where each asset flips to a public CDN URL and back. Run it with Bun (preferred) or Node >= 22.18, from the skill's `scripts/` dir:

```bash
bun cdn.ts upload ~/Downloads/diagram.png --public
```

## Commands

| Command | What it does |
| --- | --- |
| `upload <file...> [--public] [--folder p] [--name f] [--type mime]` | Reserve, PUT bytes, mark ready, then publish when `--public` is given. Folder defaults to `asset`; `--folder ""` is the root. SHA-256 is checked server-side, so a truncated upload fails instead of storing a broken file. Each upload makes a new asset, even for a filename already in the workspace — `list --match <name>` first when replacing something, then publish the new id. |
| `list [--folder p] [--match s] [--public\|--private] [--limit n]` | Every asset in the workspace, filtered client-side. |
| `get <ref>` | One asset, with its public URL when published. |
| `publish <ref>` / `unpublish <ref>` | Turn the public CDN URL on or off. Reversible either way. |
| `download <ref> [--out path]` | Writes the bytes to `--out`, or to the asset's filename in the cwd. Sends the API key, so it reaches private assets too. |
| `whoami` | Workspace id, token name, scopes — run this first when a call fails with 401 or 403. |

`<ref>` is an asset id or a **case-insensitive filename substring** matching exactly one asset; ambiguity prints the candidates and exits 1.

## Credentials

`MEDIA_CDN_API_URL` and `MEDIA_CDN_API_KEY` come from `~/.agents/.env.local`, overridden by the process environment, overridden by `--env <path>` on any command. Report `error: MEDIA_CDN_API_URL and MEDIA_CDN_API_KEY must be set …` to the user as a setup gap and stop — keys are theirs to add. Keep the key out of chat, out of logs, and out of any file you write.

## Output contract

Default output is one tab-separated line per asset, built for `cut -f`:

```
<id>\t<public-url or ->\t<filename>                       # upload, get, publish, unpublish
<id>\t<public-url or ->\t<filename>\t<bytes>\t<folder>    # list
```

Errors go to stderr as `error: <message> (<code>)` with exit 1. Add `--json` for the full API shape — when you need `mimeType`, `versionId`, `createdAt`, or upload status, and when the user asks about an asset. When they asked for a link, the URL alone is the answer.

## Guardrails

- **Publishing puts the file on the open internet** at an unauthenticated URL. Publish what the user asked to publish; for anything else — screenshots of dashboards, exports, logs — upload private and ask before adding `--public`.
- **This deployment has no delete route.** `delete <ref>` gets a 405 and tells the user to `unpublish` instead. Treat every upload as permanent and say so before uploading anything sensitive.

**Done when** the id and URL you report came from the command's own output, and — for anything published — a `curl -sS -o /dev/null -w '%{http_code}' "<url>"` with no `Authorization` header returned `200`.
