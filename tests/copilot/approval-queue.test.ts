import test from "node:test";
import assert from "node:assert/strict";
import { getApprovalQueue, getApprovalQueueForAccount, getReturnedDraftsForAccount } from "@/lib/domain/governance";
import type { AgentRun, AuditEvent } from "@/lib/repo/types";

function event(overrides: Partial<AuditEvent>): AuditEvent {
  return {
    eventId: overrides.eventId ?? "event_test",
    type: overrides.type ?? "draft.created",
    actorId: overrides.actorId ?? "rm_junior_01",
    actorRole: overrides.actorRole ?? "Junior",
    customerId: overrides.customerId ?? "cust_0001",
    runId: overrides.runId,
    timestamp: overrides.timestamp ?? "2026-05-17T01:00:00.000Z",
    payload: overrides.payload ?? {}
  };
}

function run(overrides: Partial<AgentRun>): AgentRun {
  return {
    runId: overrides.runId ?? "run_draft_1",
    channel: "email",
    moduleId: "draft_assist",
    requestedRuntime: "skill-direct",
    backend: "skill-direct",
    model: "mock",
    llmProvider: "local",
    skillVersion: "test",
    state: overrides.state ?? "prepared",
    approvalRequired: "manager-approval",
    personaId: "persona_rm",
    customerId: overrides.customerId ?? "cust_0001",
    rmId: overrides.rmId ?? "rm_junior_01",
    roleAtRun: overrides.roleAtRun ?? "Junior",
    inputDigest: "test",
    sourceRefs: [],
    steps: [],
    output: {},
    fallbackMode: false,
    redactionLevel: "Summary",
    startedAt: "2026-05-17T01:00:00.000Z",
    finishedAt: "2026-05-17T01:00:01.000Z",
    latencyMs: 1000
  };
}

test("getApprovalQueue ignores seeded draft shells without runId", () => {
  const queue = getApprovalQueue([
    event({ eventId: "seeded_shell", runId: undefined, timestamp: "2026-05-17T01:00:00.000Z" })
  ]);
  assert.equal(queue.length, 0);
});

test("getApprovalQueue includes live draft events with runId", () => {
  const queue = getApprovalQueue([
    event({ eventId: "live_draft", runId: "run_draft_1", timestamp: "2026-05-17T01:00:00.000Z" })
  ]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].eventId, "live_draft");
});

test("getApprovalQueue removes a draft after approval transition", () => {
  const queue = getApprovalQueue([
    event({ eventId: "draft_created", runId: "run_draft_1", timestamp: "2026-05-17T01:00:00.000Z" }),
    event({
      eventId: "draft_approved",
      type: "draft.approved",
      actorId: "rm_manager_01",
      actorRole: "Manager",
      runId: "run_draft_1",
      timestamp: "2026-05-17T01:02:00.000Z"
    })
  ]);
  assert.equal(queue.length, 0);
});

test("getApprovalQueueForAccount shows Junior own drafts and Manager team drafts", () => {
  const events = [
    event({ eventId: "junior_draft", actorId: "rm_junior_01", actorRole: "Junior", runId: "run_junior" }),
    event({ eventId: "manager_draft", actorId: "rm_manager_01", actorRole: "Manager", runId: "run_manager" })
  ];

  const juniorQueue = getApprovalQueueForAccount(events, { rmId: "rm_junior_01", role: "Junior" });
  const managerQueue = getApprovalQueueForAccount(events, { rmId: "rm_manager_01", role: "Manager" });

  assert.deepEqual(juniorQueue.map((item) => item.eventId), ["junior_draft"]);
  assert.deepEqual(managerQueue.map((item) => item.eventId), ["junior_draft"]);
});

test("getReturnedDraftsForAccount shows rejected drafts to the originating RM", () => {
  const events = [
    event({ eventId: "draft_created", actorId: "rm_junior_01", actorRole: "Junior", runId: "run_draft_1" }),
    event({
      eventId: "draft_rejected",
      type: "draft.rejected",
      actorId: "rm_manager_01",
      actorRole: "Manager",
      runId: "run_draft_1",
      timestamp: "2026-05-17T01:02:00.000Z"
    })
  ];

  const returned = getReturnedDraftsForAccount(events, [run({ runId: "run_draft_1" })], {
    rmId: "rm_junior_01",
    role: "Junior"
  });

  assert.deepEqual(returned.map((item) => item.eventId), ["draft_rejected"]);
});

test("getReturnedDraftsForAccount clears once originator edits the returned draft", () => {
  const events = [
    event({ eventId: "draft_created", actorId: "rm_junior_01", actorRole: "Junior", runId: "run_draft_1" }),
    event({
      eventId: "draft_rejected",
      type: "draft.rejected",
      actorId: "rm_manager_01",
      actorRole: "Manager",
      runId: "run_draft_1",
      timestamp: "2026-05-17T01:02:00.000Z"
    }),
    event({
      eventId: "draft_edited",
      type: "draft.edited",
      actorId: "rm_junior_01",
      actorRole: "Junior",
      runId: "run_draft_1",
      timestamp: "2026-05-17T01:03:00.000Z"
    })
  ];

  const returned = getReturnedDraftsForAccount(events, [run({ runId: "run_draft_1" })], {
    rmId: "rm_junior_01",
    role: "Junior"
  });

  assert.equal(returned.length, 0);
});

test("getReturnedDraftsForAccount clears once originator deletes the returned draft", () => {
  const events = [
    event({ eventId: "draft_created", actorId: "rm_junior_01", actorRole: "Junior", runId: "run_draft_1" }),
    event({
      eventId: "draft_rejected",
      type: "draft.rejected",
      actorId: "rm_manager_01",
      actorRole: "Manager",
      runId: "run_draft_1",
      timestamp: "2026-05-17T01:02:00.000Z"
    }),
    event({
      eventId: "draft_discarded",
      type: "draft.discarded",
      actorId: "rm_junior_01",
      actorRole: "Junior",
      runId: "run_draft_1",
      timestamp: "2026-05-17T01:03:00.000Z"
    })
  ];

  const returned = getReturnedDraftsForAccount(events, [run({ runId: "run_draft_1" })], {
    rmId: "rm_junior_01",
    role: "Junior"
  });

  assert.equal(returned.length, 0);
});
