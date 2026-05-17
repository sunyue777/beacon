import test from "node:test";
import assert from "node:assert/strict";
import { auditTypeForTransition, canTransitionAgentRun } from "@/lib/copilot/approval";
import type { AgentRun } from "@/lib/repo/types";

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    runId: "run_test",
    channel: "email",
    moduleId: "draft_assist",
    requestedRuntime: "skill-direct",
    backend: "skill-direct",
    model: "test-model",
    llmProvider: "local-rules",
    skillVersion: "test@1",
    state: "prepared",
    approvalRequired: "rm-approval",
    vocabularyAdjusted: false,
    cached: false,
    workflowId: "workflow_test",
    personaId: "asia-wealth-rm",
    customerId: "cust_test",
    rmId: "rm_mid_01",
    roleAtRun: "MidLevel",
    inputDigest: "digest",
    sourceRefs: [],
    steps: [],
    output: {},
    fallbackMode: false,
    redactionLevel: "Summary",
    startedAt: "2026-05-15T01:00:00.000Z",
    finishedAt: "2026-05-15T01:00:01.000Z",
    latencyMs: 1000,
    ...overrides
  };
}

test("canTransitionAgentRun rejects send before approval", () => {
  const result = canTransitionAgentRun(run({ state: "prepared" }), "sent", { rmId: "rm_mid_01", role: "MidLevel" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "send requires approved state");
});

test("canTransitionAgentRun rejects Junior approval for rm-approval outputs", () => {
  const result = canTransitionAgentRun(run({ approvalRequired: "rm-approval" }), "approved", {
    rmId: "rm_junior_01",
    role: "Junior"
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "junior outputs require manager approval");
});

test("canTransitionAgentRun allows originating RM to edit after return", () => {
  const result = canTransitionAgentRun(run({ state: "rejected" }), "edited", { rmId: "rm_mid_01", role: "MidLevel" });
  assert.equal(result.ok, true);
});

test("canTransitionAgentRun rejects non-originator editing returned draft", () => {
  const result = canTransitionAgentRun(run({ state: "rejected" }), "edited", { rmId: "rm_junior_01", role: "Junior" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "returned draft must be edited by originating RM");
});

test("canTransitionAgentRun allows originating RM to delete a returned draft", () => {
  const result = canTransitionAgentRun(run({ state: "rejected" }), "discarded", { rmId: "rm_mid_01", role: "MidLevel" });
  assert.equal(result.ok, true);
});

test("canTransitionAgentRun rejects non-originator deleting a draft", () => {
  const result = canTransitionAgentRun(run({ state: "rejected" }), "discarded", { rmId: "rm_junior_01", role: "Junior" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "draft can only be deleted by originating RM");
});

test("canTransitionAgentRun allows Manager approval for manager-approval outputs", () => {
  const result = canTransitionAgentRun(run({ approvalRequired: "manager-approval" }), "approved", {
    rmId: "rm_manager_01",
    role: "Manager"
  });
  assert.equal(result.ok, true);
});

test("auditTypeForTransition maps state transitions to draft audit events", () => {
  assert.equal(auditTypeForTransition("edited"), "draft.edited");
  assert.equal(auditTypeForTransition("approved"), "draft.approved");
  assert.equal(auditTypeForTransition("rejected"), "draft.rejected");
  assert.equal(auditTypeForTransition("discarded"), "draft.discarded");
  assert.equal(auditTypeForTransition("sent"), "draft.sent");
});
