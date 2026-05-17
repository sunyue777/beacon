import test from "node:test";
import assert from "node:assert/strict";
import { demoAccounts } from "@/lib/auth/accounts";
import { getRepo } from "@/lib/repo";
import { runVoiceScenario } from "@/lib/voice/run";

test("runVoiceScenario prepares transcript and post-call trace", async () => {
  const repo = getRepo();
  const account = demoAccounts.find((item) => item.role === "MidLevel") ?? demoAccounts[0];
  const customers = await repo.listCustomers({ ownedBy: account.rmId, limit: 1 });
  const customer = customers.items[0];

  const result = await runVoiceScenario({
    actor: { rmId: account.rmId, name: account.name, role: account.role },
    customer,
    integrationMode: "web_call_simulator",
    scenario: "meeting_confirmation"
  });

  assert.equal(result.session.integrationMode, "web_call_simulator");
  assert.equal(result.session.customerId, customer.customerId);
  assert.ok(result.transcript);
  assert.equal(result.transcript?.customerId, customer.customerId);
  assert.ok((result.transcript?.turns.length ?? 0) >= 3);
  assert.equal(result.agentRun?.channel, "post_call_summary");
  assert.equal(result.agentRun?.moduleId, "voice_mvp");
  assert.ok(result.agentRun?.steps.some((step) => step.name === "Create voice intent"));
  assert.ok(result.agentRun?.why);
  assert.ok(result.actionItems.length >= 2);
  assert.equal(result.followUpDraft?.approvalRequired, "auto");
});

test("runVoiceScenario keeps Dyna Voice SaaS path as a traceable fallback", async () => {
  const repo = getRepo();
  const account = demoAccounts.find((item) => item.role === "Manager") ?? demoAccounts[0];
  const customers = await repo.listCustomers({ rmId: account.rmId, role: account.role, limit: 1 });
  const customer = customers.items[0];

  const result = await runVoiceScenario({
    actor: { rmId: account.rmId, name: account.name, role: account.role },
    customer,
    integrationMode: "dyna_voice_saas",
    scenario: "maturity_reminder"
  });

  assert.equal(result.session.integrationMode, "dyna_voice_saas");
  assert.equal(result.agentRun?.fallbackMode, true);
  assert.equal(result.agentRun?.approvalRequired, "rm-approval");
  assert.ok(result.agentRun?.steps.some((step) => step.source === "DynaVoiceSaaSAdapterStub"));
  assert.equal(result.followUpDraft?.approvalRequired, "rm-approval");
});
