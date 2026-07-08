import test from "node:test";
import assert from "node:assert/strict";
import { buildCopilotContext } from "@/lib/copilot/context";
import { NextBestActionClient } from "@/lib/copilot/next-best-action";
import { LocalJsonRepo } from "@/lib/repo/local-json-repo";
import type { AgentRun, CustomerProfile, PriorityTag } from "@/lib/repo/types";

test("next best action anchors maturity signal to a real holding", async () => {
  const run = await runNbaForTag("Maturity");
  const output = outputFor(run);

  assert.equal(output.actions[0].label, "Prepare reinvestment options");
  assert.match(output.actions[0].reason, /matures \d{4}-\d{2}-\d{2} \(/);
  assert.ok(output.evidence.some((item) => item.startsWith("holding:")));
});

test("next best action anchors dormant cash signal to real idle cash", async () => {
  const run = await runNbaForTag("DormantCash");
  const output = outputFor(run);

  assert.equal(output.actions[0].label, "Prepare liquidity check");
  assert.match(output.actions[0].reason, /idle cash across \d+ account/);
  assert.ok(output.evidence.some((item) => item.startsWith("account:")));
});

test("next best action anchors risk mismatch signal to a mismatched holding", async () => {
  const run = await runNbaForTag("RiskMismatch", { requireMismatch: true });
  const output = outputFor(run);

  assert.equal(output.actions[0].label, "Inspect risk mismatch");
  assert.match(output.actions[0].reason, / vs .+ profile \(/);
  assert.ok(output.evidence.some((item) => item.startsWith("holding:") && item.includes("risk")));
});

test("next best action uses generic touch only when no concrete signal matches", async () => {
  const run = await runNbaForCustomer((customer) => customer.tags.length === 1 && customer.tags[0] === "ServiceWindow");
  const output = outputFor(run);

  assert.equal(output.actions[0].label, "Prepare client touch");
});

async function runNbaForTag(tag: PriorityTag, options: { requireMismatch?: boolean } = {}) {
  return runNbaForCustomer(async (customer, repo) => {
    if (firstConcreteTag(customer) !== tag) return false;
    if (!options.requireMismatch) return true;
    const holdings = await repo.listHoldings(customer.customerId);
    return holdings.some((holding) => holding.riskStatus === "mismatch");
  });
}

function firstConcreteTag(customer: CustomerProfile) {
  return customer.tags.find((tag) => tag === "Maturity" || tag === "DormantCash" || tag === "RiskMismatch");
}

async function runNbaForCustomer(
  predicate: (customer: CustomerProfile, repo: LocalJsonRepo) => boolean | Promise<boolean>
): Promise<AgentRun> {
  const repo = new LocalJsonRepo();
  const products = await repo.listProducts();
  const rms = await repo.listRms();
  const customers = (await repo.listCustomers()).items;
  const customer = await findCustomer(repo, customers, predicate);
  const rm = rms.find((item) => item.rmId === customer.rmId);
  if (!rm) throw new Error(`Expected RM for ${customer.customerId}`);

  const request = {
    module: "next_best_action" as const,
    customerId: customer.customerId,
    intent: "Rank service actions.",
    modelRoute: "mock" as const
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
    actor: { rmId: rm.rmId, name: rm.name, role: rm.role },
    customer,
    accounts,
    holdings,
    products,
    transactions,
    lifecycleEvents,
    marketSnapshot
  });
  const result = await new NextBestActionClient().run(request, context);
  if (!result.ok) throw new Error(result.reason);
  return result.output;
}

async function findCustomer(
  repo: LocalJsonRepo,
  customers: CustomerProfile[],
  predicate: (customer: CustomerProfile, repo: LocalJsonRepo) => boolean | Promise<boolean>
) {
  for (const customer of customers) {
    if (await predicate(customer, repo)) {
      return customer;
    }
  }
  throw new Error("Expected at least one customer matching NBA test predicate.");
}

function outputFor(run: AgentRun) {
  const output = run.output as {
    actions: Array<{ label: string; reason: string }>;
    evidence: string[];
  };
  assert.ok(Array.isArray(output.actions));
  assert.ok(Array.isArray(output.evidence));
  return output;
}
