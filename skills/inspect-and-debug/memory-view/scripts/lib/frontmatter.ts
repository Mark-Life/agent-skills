/** Tolerant, zero-dependency YAML frontmatter parser for memory topic files.
 *
 * Handles the three on-disk shapes without a YAML library:
 *  - nested: top-level `name`/`description` + a `metadata:` block (node_type/type/originSessionId)
 *  - flat (legacy): `type`/`originSessionId` at top level, no `metadata:` wrapper
 *  - none: file has no leading `---` fence
 *
 * Parses defensively (single-paragraph 1,600-char lines, trailing `metadata: `
 * whitespace, mixed quoting) and preserves the raw block so a churn-aware writer
 * can re-emit minimally.
 */
import type { Frontmatter } from "./types.ts";

const EMPTY_FM = (): Frontmatter => ({
  raw: "",
  shape: "none",
  extra: {},
  hadTrailingMetadataWs: false,
  descriptionQuoted: false,
});

/** Strip a single matched pair of surrounding quotes; report whether it was quoted. */
const unquote = (v: string): { value: string; quoted: boolean } => {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return { value: t.slice(1, -1), quoted: true };
  }
  return { value: t, quoted: false };
};

/** Split a `key: value` line on the first colon. Returns null if no colon. */
const splitKv = (line: string): { key: string; value: string } | null => {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1) };
};

/**
 * Parse a file's full text into its frontmatter and body. When there is no
 * leading `---` fence the whole text is the body and shape is "none".
 */
export const parseFrontmatter = (fileText: string): { frontmatter: Frontmatter; body: string } => {
  // Tolerate a UTF-8 BOM and CRLF line endings.
  const text = fileText.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);

  if (lines[0]?.trim() !== "---") {
    return { frontmatter: EMPTY_FM(), body: text };
  }

  // Find the closing fence.
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      close = i;
      break;
    }
  }
  if (close < 0) {
    // Unterminated fence — treat the whole thing as body so we never lose content.
    return { frontmatter: EMPTY_FM(), body: text };
  }

  const blockLines = lines.slice(1, close);
  const raw = blockLines.join("\n");
  const body = lines.slice(close + 1).join("\n");

  const fm: Frontmatter = {
    raw,
    shape: "flat",
    extra: {},
    hadTrailingMetadataWs: false,
    descriptionQuoted: false,
  };

  let inMetadata = false;
  for (const line of blockLines) {
    if (line.trim() === "") continue;
    const indented = /^\s+\S/.test(line);

    // A `metadata:` key with no inline value opens the nested block.
    if (/^metadata\s*:\s*$/.test(line)) {
      fm.shape = "nested";
      inMetadata = true;
      fm.hadTrailingMetadataWs = /^metadata:[ \t]+$/.test(line);
      continue;
    }

    if (inMetadata && indented) {
      const kv = splitKv(line);
      if (!kv) continue;
      const { value } = unquote(kv.value);
      if (kv.key === "node_type") fm.nodeType = value;
      else if (kv.key === "type") fm.type = value;
      else if (kv.key === "originSessionId") fm.originSessionId = value;
      else if (kv.key === "created") fm.created = value;
      else if (kv.key === "updated") fm.updated = value;
      else fm.extra[kv.key] = value;
      continue;
    }

    // A non-indented line closes any open nested block.
    inMetadata = false;
    const kv = splitKv(line);
    if (!kv) continue;
    const { value, quoted } = unquote(kv.value);
    switch (kv.key) {
      case "name":
        fm.name = value;
        break;
      case "description":
        fm.description = value;
        fm.descriptionQuoted = quoted;
        break;
      case "type":
        fm.type = value;
        break;
      case "node_type":
        fm.nodeType = value;
        break;
      case "originSessionId":
        fm.originSessionId = value;
        break;
      case "created":
        fm.created = value;
        break;
      case "updated":
        fm.updated = value;
        break;
      default:
        fm.extra[kv.key] = value;
    }
  }

  return { frontmatter: fm, body };
};

/**
 * Re-emit a frontmatter block as canonical text, in the file's own shape.
 * Used by reindex/curate when a deterministic rewrite is unavoidable; the
 * preferred path keeps the original `raw` and edits only changed lines.
 */
export const serializeFrontmatter = (fm: Frontmatter): string => {
  const lines: string[] = [];
  if (fm.name !== undefined) lines.push(`name: ${fm.name}`);
  if (fm.description !== undefined) {
    lines.push(`description: ${fm.descriptionQuoted ? JSON.stringify(fm.description) : fm.description}`);
  }
  if (fm.shape === "nested") {
    lines.push("metadata:");
    if (fm.nodeType !== undefined) lines.push(`  node_type: ${fm.nodeType}`);
    if (fm.type !== undefined) lines.push(`  type: ${fm.type}`);
    if (fm.originSessionId !== undefined) lines.push(`  originSessionId: ${fm.originSessionId}`);
    if (fm.created !== undefined) lines.push(`  created: ${fm.created}`);
    if (fm.updated !== undefined) lines.push(`  updated: ${fm.updated}`);
  } else {
    if (fm.type !== undefined) lines.push(`type: ${fm.type}`);
    if (fm.originSessionId !== undefined) lines.push(`originSessionId: ${fm.originSessionId}`);
    if (fm.created !== undefined) lines.push(`created: ${fm.created}`);
    if (fm.updated !== undefined) lines.push(`updated: ${fm.updated}`);
  }
  for (const [k, v] of Object.entries(fm.extra)) lines.push(`${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n`;
};
