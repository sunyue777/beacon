import test from "node:test";
import assert from "node:assert/strict";
import { demoAccounts } from "@/lib/auth/accounts";
import { canTransitionAgentRun } from "@/lib/copilot/approval";
import { buildCopilotContext } from "@/lib/copilot/context";
import { DraftAssistClient } from "@/lib/copilot/draft-assist";
import { getApprovalQueueForAccount } from "@/lib/domain/governance";
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

test("Adrian routine draft is auto-approved and does not enter Sofia's queue", async () => {
  const run = await runAdrianDraft("concise_touch");

  assert.equal(run.approvalRequired, "auto");
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
  const repo = new LocalJsonRepo();
  const customer = (await repo.listCustomers({ rmId: adrian.rmId, role: adrian.role, limit: 1 })).items[0];
  const request = {
    module: "draft_assist" as const,
    customerId: customer.customerId,
    intent: "Prepare the next client service touch.",
    modelRoute: "mock" as const,
    uiContext: {
      channel: "email",
      format
    }
  };
  const [accounts, holdings, products, transactions, lifecycleEvents, marketSnapshot] = await Promise.all([
    repo.listAccounts(customer.customerId),
    repo.listHoldings(customer.customerId),
    repo.listProducts(),
    repo.listTransactions(customer.customerId, { limit: 20 }),
    repo.listLifecycleEvents(customer.customerId),
    repo.getLatestMarketSnapshot()
  ]);
  const context = buildCopilotContext({
    request,
    actor: { rmId: adrian.rmId, name: adrian.name, role: adrian.role },
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
