import test from "node:test";
import assert from "node:assert/strict";
import { demoAccounts } from "@/lib/auth/accounts";
import { canTransitionAgentRun } from "@/lib/copilot/approval";
import { buildCopilotContext } from "@/lib/copilot/context";
import { DraftAssistClient } from "@/lib/copilot/draft-assist";
import { buildEvidencePack } from "@/lib/domain/evidence-pack";
import { getApprovalQueueForAccount } from "@/lib/domain/governance";
import { getRiskComplianceSummary } from "@/lib/domain/risk-compliance";
import { LocalJsonRepo } from "@/lib/repo/local-json-repo";
import type { AgentRun, AuditEvent } from "@/lib/repo/types";

const adrian = requireDemoAccount("rm_mid_01");
const jensen = requireDemoAccount("rm_junior_01");
const sofia = requireDemoAccount("rm_manager_01");

test("Adrian sees his Mid-level book, not Jensen's book or Sofia's full team view", async () => {
  const repo = new LocalJsonRepo();
  const adrianBook = await repo.listCustomers({ rmId: adrian.rmId, role: adrian.role });
  const jensenBook = await repo.listCustomers({ rmId: jensen.rmId, role: jensen.role });
  const sofiaBook = await repo.listCustomers({ rmId: sofia.rmId, role: sofia.role });

  assert.equal(adrianBook.total, 296);
  assert.ok(adrianBook.items.every((customer) => customer.rmId === adrian.rmId));
  assert.ok(sofiaBook.total > adrianBook.total);

  const adrianCustomer = adrianBook.items[0];
  const jensenCustomer = jensenBook.items[0];
  assert.equal(await repo.canViewCustomer(adrianCustomer.customerId, { rmId: adrian.rmId, role: adrian.role }), true);
  assert.equal(await repo.canViewCustomer(jensenCustomer.customerId, { rmId: adrian.rmId, role: adrian.role }), false);
  assert.equal(await repo.canViewCustomer(adrianCustomer.customerId, { rmId: sofia.rmId, role: sofia.role }), true);
});

test("Adrian routine draft uses self-approval and does not enter Sofia's queue", async () => {
  const run = await runAdrianDraft("concise_touch");

  assert.equal(run.approvalRequired, "rm-approval");
  assert.equal(canTransitionAgentRun(run, "approved", { rmId: adrian.rmId, role: adrian.role }).ok, true);

  const sofiaQueue = getApprovalQueueForAccount(
    [
      event({
        eventId: "adrian_routine_output",
        type: "ai.output.shown",
        actorId: adrian.rmId,
        actorRole: adrian.role,
        customerId: run.customerId,
        runId: run.runId
      })
    ],
    { rmId: sofia.rmId, role: sofia.role }
  );

  assert.equal(sofiaQueue.length, 0);
});

test("Jensen routine draft requires manager approval and appears in Sofia's queue", async () => {
  const run = await runDraftFor(jensen.rmId, "concise_touch");

  assert.equal(run.approvalRequired, "manager-approval");

  const jensenApproval = canTransitionAgentRun(run, "approved", { rmId: jensen.rmId, role: jensen.role });
  assert.equal(jensenApproval.ok, false);
  if (!jensenApproval.ok) assert.equal(jensenApproval.reason, "manager approval required");

  const sofiaQueue = getApprovalQueueForAccount(
    [
      event({
        eventId: "jensen_routine_created",
        type: "draft.created",
        actorId: jensen.rmId,
        actorRole: jensen.role,
        customerId: run.customerId,
        runId: run.runId,
        payload: { approvalRequired: run.approvalRequired }
      })
    ],
    { rmId: sofia.rmId, role: sofia.role }
  );

  assert.deepEqual(sofiaQueue.map((item) => item.eventId), ["jensen_routine_created"]);
});

test("Block compliance escalates routine draft and adds gate evidence", async () => {
  const run = await runDraftFor(jensen.rmId, "concise_touch", "Block");
  const output = run.output as { draft?: string; approvalChecklist?: string[] };

  assert.equal(run.approvalRequired, "manager-approval");
  assert.ok(output.draft?.includes("COMPLIANCE GATE: Suitability expired"));
  assert.ok(output.approvalChecklist?.some((item) => item.includes("Suitability expired")));
  assert.ok(run.steps.some((step) => step.name === "Compliance gate"));
});

test("Email draft applies disclaimer rule and exports policy rule checks", async () => {
  const run = await runAdrianDraft("concise_touch");
  const output = run.output as { draft?: string };
  const ruleSources = run.steps.map((step) => step.source);

  assert.match(output.draft ?? "", /For discussion and review only/);
  assert.ok(ruleSources.includes("rule_suitability_01"));
  assert.ok(ruleSources.includes("rule_draft_approval_01"));
  assert.ok(ruleSources.includes("rule_disclaimer_01"));
  assert.ok(run.sourceRefs.includes("rule_disclaimer_01"));

  const pack = buildEvidencePack({ run, customerName: "Test Client" });
  assert.ok(pack.governance.ruleChecks.some((item) => item.includes("rule_draft_approval_01")));
  assert.ok(pack.governance.ruleChecks.some((item) => item.includes("rule_disclaimer_01")));
});

test("WhatsApp draft records disclaimer exemption without appending long disclaimer", async () => {
  const run = await runDraftFor(adrian.rmId, "concise_touch", "NonBlock", "whatsapp");
  const output = run.output as { draft?: string };
  const disclaimerStep = run.steps.find((step) => step.source === "rule_disclaimer_01");

  assert.doesNotMatch(output.draft ?? "", /For discussion and review only/);
  assert.deepEqual(
    isRecord(disclaimerStep?.output) ? disclaimerStep.output.result : undefined,
    "exempt"
  );
});

test("Adrian Client Review Pack still requires manager approval and appears in Sofia's queue", async () => {
  const run = await runAdrianDraft("client_review_pack");

  assert.equal(run.approvalRequired, "manager-approval");

  const adrianApproval = canTransitionAgentRun(run, "approved", { rmId: adrian.rmId, role: adrian.role });
  assert.equal(adrianApproval.ok, false);
  if (!adrianApproval.ok) assert.equal(adrianApproval.reason, "manager approval required");

  assert.equal(canTransitionAgentRun(run, "approved", { rmId: sofia.rmId, role: sofia.role }).ok, true);

  const sofiaQueue = getApprovalQueueForAccount(
    [
      event({
        eventId: "adrian_review_pack_created",
        type: "draft.created",
        actorId: adrian.rmId,
        actorRole: adrian.role,
        customerId: run.customerId,
        runId: run.runId,
        payload: { approvalRequired: run.approvalRequired }
      })
    ],
    { rmId: sofia.rmId, role: sofia.role }
  );

  assert.deepEqual(sofiaQueue.map((item) => item.eventId), ["adrian_review_pack_created"]);
});

async function runAdrianDraft(format: string): Promise<AgentRun> {
  return runDraftFor(adrian.rmId, format);
}

async function runDraftFor(
  rmId: string,
  format: string,
  complianceTarget: "Block" | "NonBlock" = "NonBlock",
  channel: "email" | "whatsapp" = "email"
): Promise<AgentRun> {
  const repo = new LocalJsonRepo();
  const account = requireDemoAccount(rmId);
  const products = await repo.listProducts();
  const customers = (await repo.listCustomers({ rmId: account.rmId, role: account.role })).items;
  const customer = await findCustomerForMatrixTest(repo, customers, products, complianceTarget);
  const request = {
    module: "draft_assist" as const,
    customerId: customer.customerId,
    intent: "Prepare the next client service touch.",
    modelRoute: "mock" as const,
    uiContext: {
      channel,
      format
    }
  };
  const [accounts, holdings, transactions, lifecycleEvents, marketSnapshot] = await Promise.all([
    repo.listAccounts(customer.customerId),
    repo.listHoldings(customer.customerId),
    repo.listTransactions(customer.customerId, { limit: 20 }),
    repo.listLifecycleEvents(customer.customerId),
    repo.getLatestMarketSnapshot()
  ]);
  const context = buildCopilotContext({
    request,
    actor: { rmId: account.rmId, name: account.name, role: account.role },
    customer,
    accounts,
    holdings,
    products,
    transactions,
    lifecycleEvents,
    marketSnapshot
  });
  const result = await new DraftAssistClient().run(request, context);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.output;
}

async function findCustomerForMatrixTest(
  repo: LocalJsonRepo,
  customers: Awaited<ReturnType<LocalJsonRepo["listCustomers"]>>["items"],
  products: Awaited<ReturnType<LocalJsonRepo["listProducts"]>>,
  target: "Block" | "NonBlock"
) {
  for (const customer of customers) {
    const holdings = await repo.listHoldings(customer.customerId);
    const compliance = getRiskComplianceSummary(customer, holdings, products);
    if ((target === "Block" && compliance.worst === "Block") || (target === "NonBlock" && compliance.worst !== "Block")) {
      return customer;
    }
  }
  throw new Error(`Expected at least one ${target} customer for approval matrix tests.`);
}

function event(overrides: Partial<AuditEvent>): AuditEvent {
  return {
    eventId: overrides.eventId ?? "event_test",
    type: overrides.type ?? "draft.created",
    actorId: overrides.actorId ?? adrian.rmId,
    actorRole: overrides.actorRole ?? adrian.role,
    customerId: overrides.customerId,
    runId: overrides.runId,
    timestamp: overrides.timestamp ?? "2026-07-07T01:00:00.000Z",
    payload: overrides.payload ?? {}
  };
}

function requireDemoAccount(rmId: string) {
  const account = demoAccounts.find((item) => item.rmId === rmId);
  if (!account) {
    throw new Error(`Expected demo account ${rmId} to exist.`);
  }
  return account;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
