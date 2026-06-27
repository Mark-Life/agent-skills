/**
 * memory-view — detector + redaction smoke tests.
 *
 * These run the real scan pipeline against the synthetic vaults in ./fixtures.
 * They are the regression net for the deterministic detectors and the
 * secret-redaction layer. Runtime code is imported by relative path from the
 * (shipped) skill folder; fixtures are inputs, resolved via import.meta.dir.
 */
import { test, expect, describe } from "bun:test";
import { join } from "node:path";

import { resolveTarget } from "../../skills/memory-view/scripts/lib/resolve.ts";
import { parseVault } from "../../skills/memory-view/scripts/lib/parse.ts";
import { buildGraph } from "../../skills/memory-view/scripts/lib/graph.ts";
import { runAudit } from "../../skills/memory-view/scripts/lib/audit.ts";
import { buildCandidates } from "../../skills/memory-view/scripts/lib/candidates.ts";
import { assembleVault } from "../../skills/memory-view/scripts/lib/findings.ts";
import { redactVault, redactText } from "../../skills/memory-view/scripts/lib/redact.ts";

const FIXTURES = join(import.meta.dir, "fixtures");

/** Run the full read pipeline against one fixture vault. */
const analyze = (name: string) => {
  const target = resolveTarget(join(FIXTURES, name));
  const vault = parseVault(target);
  const graph = buildGraph(vault);
  const findings = runAudit(vault, graph);
  return { target, vault, graph, findings };
};

// Fixture → the check-id prefix its primary deterministic detector emits.
// (near-dup/contradiction are model-judgment *candidates*, not findings — covered separately.)
const DETECTOR_CASES: Array<[string, string]> = [
  ["secrets", "SEC"],
  ["broken-links", "LNK"],
  ["orphans", "IDX"],
  ["dangling", "IDX"],
  ["flat-schema", "SCH"],
  ["monolithic", "IDX"],
];

describe("deterministic detectors fire on their fixtures", () => {
  for (const [name, prefix] of DETECTOR_CASES) {
    test(`${name} → ${prefix}*`, () => {
      const { vault, findings } = analyze(name);
      expect(vault.memoryDir).toContain(name);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f) => f.check.startsWith(prefix))).toBe(true);
    });
  }
});

describe("secret redaction", () => {
  test("redactText masks provider-prefixed credentials", () => {
    expect(redactText("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE")).toContain("[REDACTED:aws-access-key-id]");
    expect(
      redactText("OPENAI_API_KEY=sk-proj-EXAMPLE00fake00NOTREAL00example00abcd"),
    ).toContain("[REDACTED:openai-key]");
  });

  test("redactVault scrubs the planted keys from the fixture's bodies", () => {
    // The secret lives in the memory body (which the HTML embeds), not in
    // findings.json — so redaction is asserted on the rendered vault bodies.
    const { vault, graph, findings } = analyze("secrets");
    const candidates = buildCandidates(vault);
    const av = assembleVault(vault, graph, findings, candidates);

    const before = av.files.map((f) => f.body).join("\n");
    expect(before).toContain("AKIAIOSFODNN7EXAMPLE"); // sanity: raw body holds the planted key

    redactVault(av); // mutates in place
    const after = av.files.map((f) => f.body).join("\n");
    expect(after).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(after).not.toContain("sk-proj-");
    expect(after).toContain("[REDACTED:");
  });
});
