/**
 * harness-doctor — command normalisation and error-signature tests.
 *
 * `normalizeCommand` is the hinge of the audit: it decides which Bash calls
 * roll up into one family for cost aggregation. `errorSignature` decides
 * which failures cluster. Runtime code is imported by relative path from the
 * (shipped) skill folder, in the style of `tests/session-report/tokens.test.ts`.
 */
import { test, expect, describe } from "bun:test";

import {
  commandFamily,
  baseBinary,
  normalizeCommandText,
  errorSignature,
} from "../../skills/inspect-and-debug/harness-doctor/scripts/lib/normalize.ts";
import { redactText, REDACTED } from "../../skills/inspect-and-debug/harness-doctor/scripts/lib/redact.ts";

describe("commandFamily", () => {
  test("same script, different flags -> one family", () => {
    expect(commandFamily("bun run typecheck --filter web")).toBe("bun run typecheck");
    expect(commandFamily("bun run typecheck --filter api")).toBe("bun run typecheck");
  });

  test("a different script under the same runner is a different family", () => {
    expect(commandFamily("bun test")).not.toBe(commandFamily("bun run typecheck --filter web"));
  });

  test("a leading cd attributes to the real command", () => {
    expect(commandFamily("cd /some/path && pnpm build")).toBe("pnpm build");
  });

  test("npx and bunx unwrap to the wrapped binary and script", () => {
    const npx = commandFamily("npx tsx x.ts");
    const bunx = commandFamily("bunx tsx x.ts");
    expect(baseBinary("npx tsx x.ts")).toBe("tsx");
    expect(baseBinary("bunx tsx x.ts")).toBe("tsx");
    expect(npx).toBe(bunx);
    expect(npx).toBe("tsx x");
  });
});

describe("normalizeCommandText masks varying literals", () => {
  test("absolute paths, quoted strings, uuids, and hashes mask out", () => {
    const cmd = `cp /Users/andrey-m/src/file.txt "quoted string" 550e8400-e29b-41d4-a716-446655440000 deadbeef123`;
    expect(normalizeCommandText(cmd)).toBe("cp <path> <str> <lit> <lit>");
  });

  test("flags survive the mask, only their values are stripped", () => {
    expect(normalizeCommandText("rg --glob=*.ts TODO")).toContain("--glob=<v>");
  });
});

describe("errorSignature clusters same-shape failures", () => {
  test("same message, different filename -> same signature", () => {
    const a = errorSignature("ENOENT: no such file 'a.ts'");
    const b = errorSignature("ENOENT: no such file 'b.ts'");
    expect(a).toBe(b);
    expect(a).toBe("ENOENT: no such file <str>");
  });

  test("a differently shaped message clusters separately", () => {
    expect(errorSignature("ENOENT: no such file 'a.ts'")).not.toBe(errorSignature("permission denied: /etc/hosts"));
  });
});

describe("redactText masks secrets, leaves ordinary text alone", () => {
  test("an sk- key is redacted", () => {
    expect(redactText("OPENAI_KEY=sk-1234567890abcdefghijklmnop")).toContain(REDACTED);
  });

  test("a ghp_ token is redacted", () => {
    expect(redactText(`token: ghp_${"A".repeat(36)}`)).toContain(REDACTED);
  });

  test("an AUTH_TOKEN=... assignment is redacted", () => {
    const out = redactText("AUTH_TOKEN=abc123def456ghi789");
    expect(out).toContain(REDACTED);
    expect(out).not.toContain("abc123def456ghi789");
  });

  test("ordinary text survives untouched", () => {
    expect(redactText("the build passed in 12s")).toBe("the build passed in 12s");
  });
});
