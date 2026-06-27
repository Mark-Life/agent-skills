/**
 * Guard: a skill folder IS the shipped artifact.
 *
 * `npx skills add` copies the entire skill directory to the end user; the
 * installer only strips `.git`, `__pycache__`, `__pypackages__`, `metadata.json`
 * — NOT fixtures, tests, node_modules, or build output. So nothing dev-only may
 * be committed under skills/. This test fails CI if that rule is broken.
 *
 * It inspects *tracked* files (what actually ships), so gitignored on-disk
 * cruft like a local node_modules/ or bun.lock does not trip it.
 */
import { test, expect, describe } from "bun:test";
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

/** git-tracked paths under `dir`, repo-root-relative. */
const trackedUnder = (dir: string): string[] =>
  execFileSync("git", ["ls-files", dir], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

describe("skills/ ships only runtime artifacts", () => {
  const files = trackedUnder("skills");

  test("repo actually has tracked skill files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test("no test/spec files committed under skills/", () => {
    const offenders = files.filter((f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
    expect(offenders).toEqual([]);
  });

  test("no dev-only directories committed under skills/", () => {
    const BAD = ["fixtures", "__tests__", "__mocks__", "node_modules", "dist", "build", "coverage"];
    const offenders = files.filter((f) => f.split("/").some((seg) => BAD.includes(seg)));
    expect(offenders).toEqual([]);
  });

  test("every skill directory has a SKILL.md", () => {
    const skillsDir = join(REPO_ROOT, "skills");
    const dirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs) {
      expect(existsSync(join(skillsDir, d, "SKILL.md"))).toBe(true);
    }
  });
});
