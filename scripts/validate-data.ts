import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DataBundle } from "../lib/repo/types";

const projectRoot = process.cwd().endsWith("Dyna-Beacon") ? process.cwd() : path.join(process.cwd(), "Dyna-Beacon");
const dataPath = path.join(projectRoot, "data", "asia-wealth", "bundle.json");
const errors: string[] = [];

async function main() {
  const data = JSON.parse(await readFile(dataPath, "utf8")) as DataBundle;
  validateReferences(data);
  validateRmScopes(data);
  validateOwnershipModel(data);
  validateAum(data);
  validatePortfolioVariety(data);
  validateDeepDive(data);
  validateNames(data);
  validateCurrencyModel(data);
  validateHoldingRiskStatus(data);
  validateHoldingAccountValues(data);
  validatePriorityBookHoldings(data);
  validateAumDiversity(data);
  validateContactSignals(data);
  validateDemoDistributions(data);

  if (errors.length > 0) {
    console.error(`Data validation failed with ${errors.length} error(s):`);
    for (const error of errors.slice(0, 40)) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Data validation passed for ${data.customers.length} customers.`);
}

function validateReferences(data: DataBundle) {
  const customerIds = new Set(data.customers.map((item) => item.customerId));
  const accountById = new Map(data.accounts.map((item) => [item.accountId, item]));
  const productById = new Map(data.products.map((item) => [item.productId, item]));
  const accountIds = new Set(accountById.keys());
  const productIds = new Set(productById.keys());
  const rmIds = new Set(data.rms.map((item) => item.rmId));
  const ruleIds = new Set(data.policyRules.map((item) => item.ruleId));
  const runIds = new Set(data.agentRuns.map((item) => item.runId));

  for (const account of data.accounts) {
    assert(customerIds.has(account.customerId), `Account ${account.accountId} references missing customer ${account.customerId}`);
  }
  for (const holding of data.holdings) {
    assert(customerIds.has(holding.customerId), `Holding ${holding.holdingId} references missing customer ${holding.customerId}`);
    assert(accountIds.has(holding.accountId), `Holding ${holding.holdingId} references missing account ${holding.accountId}`);
    assert(productIds.has(holding.productId), `Holding ${holding.holdingId} references missing product ${holding.productId}`);
    const account = accountById.get(holding.accountId);
    const product = productById.get(holding.productId);
    assert(account?.customerId === holding.customerId, `Holding ${holding.holdingId} account belongs to a different customer`);
    assert(account?.currency === holding.currency, `Holding ${holding.holdingId} currency ${holding.currency} does not match account ${account?.currency}`);
    assert(!product || product.baseCurrency === holding.currency, `Holding ${holding.holdingId} product currency ${product?.baseCurrency} does not match holding ${holding.currency}`);
  }
  for (const transaction of data.transactions) {
    assert(customerIds.has(transaction.customerId), `Transaction ${transaction.transactionId} references missing customer ${transaction.customerId}`);
    assert(accountIds.has(transaction.accountId), `Transaction ${transaction.transactionId} references missing account ${transaction.accountId}`);
    const account = accountById.get(transaction.accountId);
    assert(account?.customerId === transaction.customerId, `Transaction ${transaction.transactionId} account belongs to a different customer`);
    assert(account?.currency === transaction.currency, `Transaction ${transaction.transactionId} currency ${transaction.currency} does not match account ${account?.currency}`);
    if (transaction.productId) {
      assert(productIds.has(transaction.productId), `Transaction ${transaction.transactionId} references missing product ${transaction.productId}`);
    }
  }
  for (const run of data.agentRuns) {
    assert(rmIds.has(run.rmId), `AgentRun ${run.runId} references missing RM ${run.rmId}`);
    if (run.customerId) assert(customerIds.has(run.customerId), `AgentRun ${run.runId} references missing customer ${run.customerId}`);
  }
  for (const event of data.auditEvents) {
    assert(rmIds.has(event.actorId), `AuditEvent ${event.eventId} references missing actor ${event.actorId}`);
    if (event.customerId) assert(customerIds.has(event.customerId), `AuditEvent ${event.eventId} references missing customer ${event.customerId}`);
    if (event.runId) assert(runIds.has(event.runId), `AuditEvent ${event.eventId} references missing run ${event.runId}`);
  }
  for (const transcript of data.transcripts ?? []) {
    assert(customerIds.has(transcript.customerId), `Transcript ${transcript.transcriptId} references missing customer ${transcript.customerId}`);
    assert(rmIds.has(transcript.rmId), `Transcript ${transcript.transcriptId} references missing RM ${transcript.rmId}`);
    assert(transcript.turns.length > 0, `Transcript ${transcript.transcriptId} has no turns`);
  }
  for (const check of data.ruleCheckResults) {
    assert(ruleIds.has(check.ruleId), `RuleCheckResult ${check.resultId} references missing rule ${check.ruleId}`);
    if (check.customerId) assert(customerIds.has(check.customerId), `RuleCheckResult ${check.resultId} references missing customer ${check.customerId}`);
    if (check.productId) assert(productIds.has(check.productId), `RuleCheckResult ${check.resultId} references missing product ${check.productId}`);
    if (check.rmId) assert(rmIds.has(check.rmId), `RuleCheckResult ${check.resultId} references missing RM ${check.rmId}`);
  }
  for (const config of data.moduleConfigs) {
    assert(Boolean(config.moduleId), "ModuleConfig has empty moduleId");
  }
}

function validateRmScopes(data: DataBundle) {
  const customersByRm = new Map<string, string[]>();
  for (const customer of data.customers) {
    customersByRm.set(customer.rmId, [...(customersByRm.get(customer.rmId) ?? []), customer.customerId]);
  }

  for (const rm of data.rms) {
    if ("customerIds" in rm.bookScope) {
      const assigned = new Set(customersByRm.get(rm.rmId) ?? []);
      for (const customerId of rm.bookScope.customerIds) {
        assert(assigned.has(customerId), `RM ${rm.rmId} bookScope includes unassigned customer ${customerId}`);
      }
    }
  }
}

function validateOwnershipModel(data: DataBundle) {
  if (data.customers.length !== 595) {
    return;
  }

  const ownedByRm = new Map<string, number>();
  for (const customer of data.customers) {
    ownedByRm.set(customer.rmId, (ownedByRm.get(customer.rmId) ?? 0) + 1);
  }
  assert(ownedByRm.get("rm_junior_01") === 77, "Junior RM should own exactly 77 customers in 595-customer demo data");
  assert(ownedByRm.get("rm_mid_01") === 296, "Mid-level RM should own exactly 296 customers in 595-customer demo data");
  assert(ownedByRm.get("rm_manager_01") === 222, "Manager should directly own exactly 222 customers in 595-customer demo data");
}

function validateAum(data: DataBundle) {
  for (const customer of data.customers) {
    const cash = data.accounts.filter((account) => account.customerId === customer.customerId).reduce((sum, account) => sum + account.cashBalance, 0);
    const holdingValue = data.holdings.filter((holding) => holding.customerId === customer.customerId).reduce((sum, holding) => sum + holding.value, 0);
    const accountValue = data.accounts
      .filter((account) => account.customerId === customer.customerId && account.type !== "Investment")
      .reduce((sum, account) => sum + account.cashBalance + account.marketValue, 0);
    const explained = accountValue + holdingValue;
    const tolerance = Math.max(customer.totalAum * 0.01, 1);
    assert(Math.abs(customer.totalAum - explained) <= tolerance, `Customer ${customer.customerId} AUM mismatch: ${customer.totalAum} vs ${explained}`);
  }
}

function validatePortfolioVariety(data: DataBundle) {
  const holdingsByCustomer = new Map<string, number>();
  for (const holding of data.holdings) {
    holdingsByCustomer.set(holding.customerId, (holdingsByCustomer.get(holding.customerId) ?? 0) + 1);
  }
  const productById = new Map(data.products.map((product) => [product.productId, product]));
  const productCategories = countBy(data.products, (product) => product.category);
  for (const category of ["Fund", "ETF", "Bond", "Structured", "Deposit", "Insurance", "FX", "EquityBasket", "ModelPortfolio", "Alternative"]) {
    assert((productCategories[category] ?? 0) >= 10, `Expected at least 10 ${category} products, found ${productCategories[category] ?? 0}`);
  }
  assert((productCategories.Fund ?? 0) >= 30, `Expected at least 30 Fund products, found ${productCategories.Fund ?? 0}`);
  assert((productCategories.EquityBasket ?? 0) >= 30, `Expected at least 30 EquityBasket products, found ${productCategories.EquityBasket ?? 0}`);
  const categorySets = new Map<string, Set<string>>();
  for (const holding of data.holdings) {
    const set = categorySets.get(holding.customerId) ?? new Set<string>();
    set.add(productById.get(holding.productId)?.category ?? "Unknown");
    categorySets.set(holding.customerId, set);
  }

  assert(data.customers.some((customer) => (holdingsByCustomer.get(customer.customerId) ?? 0) === 0), "Missing no-holdings customers");
  assert(data.customers.some((customer) => categorySets.get(customer.customerId)?.size === 1 && categorySets.get(customer.customerId)?.has("ETF")), "Missing ETF-only customers");
  assert(data.customers.some((customer) => categorySets.get(customer.customerId)?.size === 1 && categorySets.get(customer.customerId)?.has("Fund")), "Missing fund-only customers");
  assert(data.customers.some((customer) => categorySets.get(customer.customerId)?.size === 1 && categorySets.get(customer.customerId)?.has("Deposit")), "Missing deposit-only customers");
  assert(data.customers.some((customer) => (categorySets.get(customer.customerId)?.size ?? 0) >= 4), "Missing mixed portfolios");
  assert(data.customers.filter((customer) => (holdingsByCustomer.get(customer.customerId) ?? 0) >= 30).length >= Math.min(10, data.customers.length), "Missing 10 hero customers with 30+ holdings");
}

function validateDeepDive(data: DataBundle) {
  const txByCustomer = new Map<string, number>();
  for (const transaction of data.transactions) {
    txByCustomer.set(transaction.customerId, (txByCustomer.get(transaction.customerId) ?? 0) + 1);
  }
  const deepDiveCount = data.customers.filter((customer) => (txByCustomer.get(customer.customerId) ?? 0) >= 95).length;
  assert(deepDiveCount >= Math.min(10, data.customers.length), "Missing 10 deep-dive customers with about 100 transactions");
}

function validateAumDiversity(data: DataBundle) {
  if (data.customers.length < 100) {
    return;
  }
  const zeroOrDormant = data.customers.filter((customer) => customer.totalAum === 0 || customer.hasDormantClientSignal).length;
  assert(zeroOrDormant >= 35 && zeroOrDormant <= 55, `Expected about 40 zero-AUM/dormant customers, found ${zeroOrDormant}`);
}

function validateContactSignals(data: DataBundle) {
  if (data.customers.length < 100) {
    return;
  }
  const noRecentContact = data.customers.filter((customer) => {
    if (!customer.lastContactedAt) return true;
    return daysBetween(customer.lastContactedAt, "2026-05-06") >= 120;
  }).length;
  assert(noRecentContact >= 90 && noRecentContact <= 110, `Expected about 100 no-recent-contact customers, found ${noRecentContact}`);
}

function validateDemoDistributions(data: DataBundle) {
  if (data.customers.length !== 595) {
    return;
  }

  const priorityTiers = countBy(data.customers, (customer) => {
    if (customer.priorityScore >= 85) return "Critical";
    if (customer.priorityScore >= 70) return "Active";
    if (customer.priorityScore >= 55) return "Watch";
    return "Steady";
  });
  assert((priorityTiers.Critical ?? 0) >= 12 && (priorityTiers.Critical ?? 0) <= 35, `Expected realistic Critical range, found ${priorityTiers.Critical ?? 0}`);
  assert((priorityTiers.Active ?? 0) >= 90 && (priorityTiers.Active ?? 0) <= 145, `Expected realistic Active range, found ${priorityTiers.Active ?? 0}`);
  assert((priorityTiers.Watch ?? 0) >= 280 && (priorityTiers.Watch ?? 0) <= 360, `Expected realistic Watch range, found ${priorityTiers.Watch ?? 0}`);
  assert((priorityTiers.Steady ?? 0) >= 95 && (priorityTiers.Steady ?? 0) <= 170, `Expected realistic Steady range, found ${priorityTiers.Steady ?? 0}`);

  const suitability = countBy(data.customers, (customer) => {
    const days = daysBetween("2026-05-06", customer.suitabilityExpiresAt);
    if (days < 0) return "Block";
    if (days <= 30) return "Watch";
    return "Pass";
  });
  assert((suitability.Pass ?? 0) >= 350 && (suitability.Pass ?? 0) <= 430, `Expected realistic suitability Pass range, found ${suitability.Pass ?? 0}`);
  assert((suitability.Watch ?? 0) >= 30 && (suitability.Watch ?? 0) <= 70, `Expected realistic suitability Watch range, found ${suitability.Watch ?? 0}`);
  assert((suitability.Block ?? 0) >= 130 && (suitability.Block ?? 0) <= 190, `Expected realistic suitability Block range, found ${suitability.Block ?? 0}`);

  const knowledge = countBy(data.customers, (customer) => customer.knowledgeAssessmentStatus);
  assert((knowledge.Valid ?? 0) >= 340, `Expected at least 340 K&E Valid customers, found ${knowledge.Valid ?? 0}`);
  assert((knowledge.Expiring ?? 0) >= 30 && (knowledge.Expiring ?? 0) <= 70, `Expected realistic K&E Expiring range, found ${knowledge.Expiring ?? 0}`);
  assert((knowledge.Pending ?? 0) >= 10 && (knowledge.Pending ?? 0) <= 35, `Expected realistic K&E Pending range, found ${knowledge.Pending ?? 0}`);
  assert((knowledge.Expired ?? 0) >= 130 && (knowledge.Expired ?? 0) <= 190, `Expected realistic K&E Expired range, found ${knowledge.Expired ?? 0}`);

  const fundingCurrency = countBy(data.customers, (customer) => customer.fundingCurrency);
  assert((fundingCurrency.SGD ?? 0) >= 240 && (fundingCurrency.SGD ?? 0) <= 300, `Expected realistic SGD funding range, found ${fundingCurrency.SGD ?? 0}`);
  assert((fundingCurrency.HKD ?? 0) >= 170 && (fundingCurrency.HKD ?? 0) <= 220, `Expected realistic HKD funding range, found ${fundingCurrency.HKD ?? 0}`);
  assert((fundingCurrency.JPY ?? 0) >= 60 && (fundingCurrency.JPY ?? 0) <= 95, `Expected realistic JPY funding range, found ${fundingCurrency.JPY ?? 0}`);
  assert((fundingCurrency.USD ?? 0) >= 35 && (fundingCurrency.USD ?? 0) <= 65, `Expected realistic USD funding range, found ${fundingCurrency.USD ?? 0}`);

  const serviceTiers = countBy(data.customers, (customer) => customer.serviceTier);
  assert((serviceTiers.Private ?? 0) > 0 && (serviceTiers.Private ?? 0) < 20, `Expected fewer than 20 Private customers, found ${serviceTiers.Private ?? 0}`);
  const segmentByTier: Record<string, string> = { Standard: "Mass", Premium: "Affluent", VIP: "HNW", Private: "UHNW" };
  for (const customer of data.customers) {
    assert(customer.segment === segmentByTier[customer.serviceTier], `Customer ${customer.customerId} segment ${customer.segment} does not match service tier ${customer.serviceTier}`);
  }

  const sessionEvents = countBy(
    data.auditEvents.filter((event) => event.type === "session.started" || event.type === "session.switched"),
    (event) => event.type
  );
  assert(sessionEvents["session.started"] === 3, `Expected 3 session.started events, found ${sessionEvents["session.started"] ?? 0}`);
  assert(sessionEvents["session.switched"] === 1, `Expected 1 session.switched event, found ${sessionEvents["session.switched"] ?? 0}`);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function validateNames(data: DataBundle) {
  const badNamePattern = /(masked|test|asdf|xxxx|customer\s*\d+)/i;
  const nameCounts = countBy(data.customers, (customer) => customer.name);
  for (const customer of data.customers) {
    assert(customer.name.includes(" ") && !badNamePattern.test(customer.name), `Customer ${customer.customerId} has invalid name ${customer.name}`);
  }
  const duplicateNames = Object.entries(nameCounts).filter(([, count]) => count > 1);
  assert(duplicateNames.length <= 5, `Expected high name diversity; found ${duplicateNames.length} duplicated full names`);

  const surnameCounts = countBy(data.customers, (customer) => customer.name.trim().split(/\s+/).at(-1) ?? "");
  const yamamotoCount = surnameCounts.Yamamoto ?? 0;
  assert(yamamotoCount > 0 && yamamotoCount <= 15, `Expected Yamamoto surname to appear but not dominate; found ${yamamotoCount}`);

  const householdGroups = countBy(
    data.customers.filter((customer) => customer.householdId),
    (customer) => customer.householdId ?? "none"
  );
  assert(Object.values(householdGroups).some((count) => count >= 2), "Expected at least one explicit household relationship group");
}

function validateCurrencyModel(data: DataBundle) {
  const accountCurrency = countBy(data.accounts, (account) => account.currency);
  assert((accountCurrency.SGD ?? 0) > 0, "Missing SGD accounts");
  assert((accountCurrency.HKD ?? 0) > 0, "Missing HKD accounts");
  assert((accountCurrency.JPY ?? 0) > 0, "Missing JPY accounts");
  assert((accountCurrency.USD ?? 0) > 0, "Missing USD accounts");

  const accountsByCustomer = new Map<string, Set<string>>();
  for (const account of data.accounts) {
    const set = accountsByCustomer.get(account.customerId) ?? new Set<string>();
    set.add(account.currency);
    accountsByCustomer.set(account.customerId, set);
  }
  const multiCurrencyCustomers = [...accountsByCustomer.values()].filter((set) => set.size > 1).length;
  assert(multiCurrencyCustomers >= 60, `Expected at least 60 multi-currency customers, found ${multiCurrencyCustomers}`);

  const accountType = countBy(data.accounts, (account) => account.type);
  assert((accountType.Cash ?? 0) === data.customers.length, `Expected every customer to have one cash account, found ${accountType.Cash ?? 0}`);
  assert((accountType.Investment ?? 0) >= data.customers.length, `Expected at least one investment account per customer, found ${accountType.Investment ?? 0}`);
  assert((accountType.TermDeposit ?? 0) >= 120, `Expected material term deposit account coverage, found ${accountType.TermDeposit ?? 0}`);
}

function validateHoldingRiskStatus(data: DataBundle) {
  const riskOrder = ["Conservative", "ModConservative", "Moderate", "ModAggressive", "Aggressive"];
  const customerById = new Map(data.customers.map((customer) => [customer.customerId, customer]));
  const productById = new Map(data.products.map((product) => [product.productId, product]));
  for (const holding of data.holdings) {
    const customer = customerById.get(holding.customerId);
    const product = productById.get(holding.productId);
    if (!customer || !product) continue;
    const shouldMismatch = riskOrder.indexOf(product.riskLevel) - riskOrder.indexOf(customer.riskProfile) >= 1;
    assert(
      holding.riskStatus === (shouldMismatch ? "mismatch" : "aligned"),
      `Holding ${holding.holdingId} riskStatus ${holding.riskStatus} does not match ${product.riskLevel} vs ${customer.riskProfile}`
    );
  }
}

function validateHoldingAccountValues(data: DataBundle) {
  const holdingsByAccount = new Map<string, number>();
  for (const holding of data.holdings) {
    holdingsByAccount.set(holding.accountId, (holdingsByAccount.get(holding.accountId) ?? 0) + holding.value);
  }

  for (const account of data.accounts) {
    if (account.type !== "Investment") continue;
    const holdingValue = holdingsByAccount.get(account.accountId) ?? 0;
    const tolerance = Math.max(account.marketValue * 0.01, 1);
    assert(
      Math.abs(account.marketValue - holdingValue) <= tolerance,
      `Investment account ${account.accountId} market value ${account.marketValue} does not match holdings ${holdingValue}`
    );
  }
}

function validatePriorityBookHoldings(data: DataBundle) {
  if (data.customers.length !== 595) {
    return;
  }

  const holdingsByCustomer = new Map<string, number>();
  for (const holding of data.holdings) {
    holdingsByCustomer.set(holding.customerId, (holdingsByCustomer.get(holding.customerId) ?? 0) + 1);
  }

  for (const rmId of ["rm_junior_01", "rm_mid_01", "rm_manager_01"]) {
    const counts = data.customers
      .filter((customer) => customer.rmId === rmId)
      .sort((a, b) => b.priorityScore - a.priorityScore || b.totalAum - a.totalAum)
      .slice(0, 10)
      .map((customer) => holdingsByCustomer.get(customer.customerId) ?? 0);
    const uniqueCounts = new Set(counts);
    const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    assert(Math.min(...counts) >= 2, `Top priority book for ${rmId} should not look like no-position placeholders, found ${counts.join(", ")}`);
    assert(Math.max(...counts) === 10, `Top priority book for ${rmId} should include one 10-position client, found ${counts.join(", ")}`);
    assert(uniqueCounts.size >= 5, `Top priority book for ${rmId} needs diversified holding counts, found ${counts.join(", ")}`);
    assert(Math.abs(average - 4.2) < 0.01, `Top priority book for ${rmId} should average 4.2 holdings, found ${average.toFixed(2)} from ${counts.join(", ")}`);
    assert(counts.every((count) => count >= 2 && count <= 10), `Top priority book for ${rmId} should stay within 2-10 holdings, found ${counts.join(", ")}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    errors.push(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
