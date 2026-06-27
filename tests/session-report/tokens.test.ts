/**
 * session-report — pure formatting/estimation helper tests.
 *
 * A template demonstrating that the unit harness reaches the second skill too:
 * import a pure lib from the (shipped) skill folder and assert exact behavior.
 */
import { test, expect, describe } from "bun:test";

import {
  estTokens,
  fmt,
  fmtK,
  fmtBytes,
  fmtPct,
  fmtDuration,
} from "../../skills/session-report/scripts/lib/tokens.ts";

describe("estTokens (~len/4)", () => {
  test("empty → 0", () => expect(estTokens("")).toBe(0));
  test("rounds chars/4", () => {
    expect(estTokens("abcd")).toBe(1);
    expect(estTokens("a".repeat(400))).toBe(100);
  });
});

describe("number/byte/duration formatting", () => {
  test("fmt thousands-separates", () => expect(fmt(1000)).toBe("1,000"));
  test("fmtK compacts", () => {
    expect(fmtK(999)).toBe("999");
    expect(fmtK(5310)).toBe("5.3k");
    expect(fmtK(531202)).toBe("531k");
    expect(fmtK(2_000_000)).toBe("2.00M");
  });
  test("fmtBytes scales B/KB/MB", () => {
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(2048)).toBe("2.0 KB");
    expect(fmtBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
  test("fmtPct one decimal", () => expect(fmtPct(0.412)).toBe("41.2%"));
  test("fmtDuration", () => {
    expect(fmtDuration(0)).toBe("—");
    expect(fmtDuration(5_000)).toBe("5s");
    expect(fmtDuration(65_000)).toBe("1m 5s");
    expect(fmtDuration(3_700_000)).toBe("1h 1m");
  });
});
