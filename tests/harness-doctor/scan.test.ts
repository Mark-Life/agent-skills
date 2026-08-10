/**
 * harness-doctor — transcript discovery and classification tests.
 *
 * Runs the real scan pipeline against a synthetic session tree under
 * ./fixtures: one main session, one subagent, and one workflow agent nested
 * under subagents/workflows/wf_release/, plus a journal.jsonl that must never
 * be treated as a transcript. Runtime code is imported by relative path from
 * the (shipped) skill folder, fixtures are inputs resolved via import.meta.dir.
 */
import { test, expect, describe } from "bun:test";
import { join } from "node:path";

import { listTranscripts, scanTranscripts } from "../../skills/inspect-and-debug/harness-doctor/scripts/lib/scan.ts";
import type { AuditOptions, SessionRow } from "../../skills/inspect-and-debug/harness-doctor/scripts/lib/types.ts";

const FIXTURES = join(import.meta.dir, "fixtures");
const MAIN_SID = "a1111111-1111-4111-8111-111111111111";
const SUBAGENT_SID = "agent-b2222222-2222-4222-8222-222222222222";
const WORKFLOW_AGENT_SID = "agent-c3333333-3333-4333-8333-333333333333";

const options: AuditOptions = {
  days: 3650,
  root: FIXTURES,
  out: join(FIXTURES, "..", "__scan_out__"),
  projects: [],
  format: "json",
  top: 15,
  writeTables: false,
  redact: true,
};

const byId = (rows: SessionRow[], sid: string) => rows.find((r) => r.sid === sid);

describe("listTranscripts: nested discovery and classification", () => {
  const refs = listTranscripts(FIXTURES);

  test("finds exactly the three transcripts, skipping journal.jsonl", () => {
    expect(refs).toHaveLength(3);
    expect(refs.some((r) => r.file.endsWith("journal.jsonl"))).toBe(false);
  });

  test("classifies the main session", () => {
    const main = refs.find((r) => r.sid === MAIN_SID);
    expect(main?.kind).toBe("main");
    expect(main?.parent).toBeUndefined();
    expect(main?.run).toBeUndefined();
  });

  test("classifies the plain subagent, nested one level under subagents/", () => {
    const sub = refs.find((r) => r.sid === SUBAGENT_SID);
    expect(sub?.kind).toBe("subagent");
    expect(sub?.parent).toBe(MAIN_SID);
    expect(sub?.run).toBeUndefined();
  });

  test("classifies the workflow agent, nested under subagents/workflows/wf_*/", () => {
    const wf = refs.find((r) => r.sid === WORKFLOW_AGENT_SID);
    expect(wf?.kind).toBe("workflow-agent");
    expect(wf?.parent).toBe(MAIN_SID);
    expect(wf?.run).toBe("wf_release");
  });
});

describe("scanTranscripts: end-to-end over the fixture tree", () => {
  const result = scanTranscripts(options);

  test("scans all three transcripts, skips none", () => {
    expect(result.filesScanned).toBe(3);
    expect(result.filesSkipped).toBe(0);
    expect(result.projectCount).toBe(1);
    expect(result.tables.sessions).toHaveLength(3);
  });

  test("session rows carry the same kind/parent/run as listTranscripts", () => {
    const main = byId(result.tables.sessions, MAIN_SID);
    const sub = byId(result.tables.sessions, SUBAGENT_SID);
    const wf = byId(result.tables.sessions, WORKFLOW_AGENT_SID);
    expect(main?.kind).toBe("main");
    expect(sub?.kind).toBe("subagent");
    expect(sub?.parent).toBe(MAIN_SID);
    expect(wf?.kind).toBe("workflow-agent");
    expect(wf?.parent).toBe(MAIN_SID);
    expect(wf?.run).toBe("wf_release");
  });

  test("only the main session's real human turns count as human", () => {
    const humanTexts = result.tables.userMsgs.filter((m) => m.human).map((m) => m.text);
    expect(humanTexts).toContain("no, I said use bun not npm");
    expect(humanTexts).toContain("great, now run the build");
    expect(result.tables.userMsgs.every((m) => !m.human || m.kind === "main")).toBe(true);
  });

  test("the ENOENT error lands in errors.jsonl with a clustered signature", () => {
    const err = result.tables.errors.find((e) => e.msg.includes("ENOENT"));
    expect(err?.sig).toBe("ENOENT: no such file <str>");
  });

  test("repeated typecheck invocations roll up into one bash family", () => {
    const typecheckRuns = result.tables.bash.filter((b) => b.family === "bun run typecheck");
    expect(typecheckRuns.length).toBeGreaterThanOrEqual(2);
  });
});
