import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  Account,
  AgentRun,
  AuditEvent,
  CustomerProfile,
  DataBundle,
  Holding,
  InstitutionPolicyRule,
  LifecycleEvent,
  MarketSnapshot,
  ModuleConfig,
  PriorityTag,
  Product,
  ResearchArticle,
  RiskProfile,
  RMUser,
  RuleCheckResult,
  Transcript,
  Transaction
} from "../lib/repo/types";
import { fromUsd, roundCurrency, toUsd } from "../lib/utils/currency";

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, "data", "asia-wealth");
const customerCount = Number(process.env.SEED_COUNT ?? "595");
const personaId = "asia-wealth";
const now = resolveNow();

class Rng {
  private seed: number;

  constructor(seed = 42) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  int(min: number, max: number) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(items: T[]) {
    return items[this.int(0, items.length - 1)];
  }
}

const rng = new Rng(20260506);
const firstNames = [
  "Alicia", "Bernard", "Celeste", "Daniel", "Evelyn", "Felix", "Grace", "Hannah", "Ian", "Jasmine",
  "Kieran", "Lydia", "Marcus", "Natalie", "Oliver", "Priya", "Quentin", "Renee", "Samuel", "Teresa",
  "Victor", "Wendy", "Yvonne", "Zachary", "Aiko", "Haruto", "Mei", "Jun", "Sora", "Yuki",
  "Minji", "Jisoo", "Hana", "Seojun", "Arjun", "Anika", "Dev", "Isha", "Nadia", "Farah",
  "Hassan", "Nikhil", "Sabrina", "Wei", "Xinyi", "Zhihao", "Ming", "Linh", "Trang", "Bao",
  "Noor", "Amelia", "Kai"
];
const lastNames = [
  "Tan", "Lim", "Chen", "Wong", "Lee", "Ng", "Patel", "Kaur", "Ho", "Goh",
  "Chandra", "Rahman", "Lau", "Teo", "Fernandez", "Yamamoto", "Kim", "Chow", "Mehta", "Singh",
  "Suzuki", "Takahashi", "Nakamura", "Sato", "Kobayashi", "Ito", "Park", "Choi", "Han", "Nguyen",
  "Tran", "Pham", "Le", "Vu", "Ong", "Yeo", "Quek", "Tay", "Pillai", "Menon",
  "Shah", "Kapoor", "Bose", "Iyer", "Reddy", "Malik", "Halim", "Ismail", "Sulaiman", "Wijaya",
  "Santoso", "Setiawan", "Somchai", "Sirisena", "Perera", "Abeysekera", "Cheung", "Lam", "Fong"
];
const juniorFirstNames = [
  "Olivia", "Emma", "Charlotte", "Amelia", "Sophia", "Isabella", "Ava", "Mia", "Eleanor", "Grace",
  "Chloe", "Penelope", "Nora", "Hazel", "Violet", "Stella", "Audrey", "Claire", "Lucy", "Alice",
  "Ruby", "Ivy", "Sadie", "Eliza", "Rose", "Cora", "Maeve", "Lily", "Anna", "Julia",
  "Sophie", "Eva", "Leah", "Molly", "Sarah", "Emily", "Abigail", "Madeline", "Vivian", "Georgia",
  "Caroline", "Natalie", "Rebecca", "Lauren", "Paige", "Brooke", "Sienna", "Freya", "Phoebe", "Holly",
  "Ethan", "Liam", "Noah", "Oliver", "Lucas", "Henry", "James", "William", "Benjamin", "Theodore",
  "Alexander", "Daniel", "Matthew", "Samuel", "Nathan", "Caleb", "Julian", "Adam", "Thomas", "Edward",
  "George", "Arthur", "Oscar", "Felix", "Hugo", "Leo", "Maxwell", "Simon", "Peter", "Andrew",
  "Charles", "Miles", "Elliot", "Graham", "Spencer", "Wesley", "Connor", "Dylan", "Owen", "Logan"
];
const juniorLastNames = [
  "Anderson", "Bennett", "Carter", "Cooper", "Dawson", "Edwards", "Foster", "Graham", "Harrison", "Hayes",
  "Howard", "Jackson", "Keller", "Lawson", "Marshall", "Miller", "Morgan", "Parker", "Reed", "Russell",
  "Sawyer", "Spencer", "Taylor", "Walker", "Wallace", "Warren", "West", "Whitman", "Wilson", "Wood",
  "Archer", "Blake", "Brooks", "Chambers", "Coleman", "Collins", "Ellis", "Fletcher", "Grant", "Hamilton",
  "Harper", "Hart", "Hudson", "Hunter", "Kennedy", "King", "Lane", "Lawrence", "Mason", "Morrison",
  "Nolan", "Palmer", "Pierce", "Porter", "Price", "Quinn", "Riley", "Rowan", "Scott", "Sullivan",
  "Turner", "Vaughn", "Walsh", "Watson", "Webster", "Wells", "Wright", "Young", "Abbott", "Bishop",
  "Bryant", "Caldwell", "Douglas", "Franklin", "Griffin", "Holland", "Murray", "Newton", "Perry", "Stone",
  "Tucker", "Wagner", "Barker", "Barrett", "Hughes", "Fleming", "Sinclair", "Bradley", "Hale", "Winslow"
];
const professions = ["Regional Sales Director", "Product Manager", "Medical Specialist", "Family Business Owner", "Senior Engineer", "Legal Counsel", "University Lecturer", "Technology Founder", "Finance Controller", "Design Principal"];
const cities = ["Singapore", "Hong Kong", "Kuala Lumpur", "Bangkok", "Taipei", "Jakarta"];
const risks: RiskProfile[] = ["Conservative", "ModConservative", "Moderate", "ModAggressive", "Aggressive"];
const categories: Product["category"][] = ["Fund", "ETF", "Bond", "Structured", "Deposit", "Insurance", "FX", "EquityBasket", "ModelPortfolio", "Alternative"];
const investmentCurrencies = ["USD", "SGD", "HKD", "JPY"] as const;
const modules = ["client-book", "client-360", "ai-output", "talking-points", "term-explainer", "next-best-action", "copilot-chat", "communication-drafts", "manager-view", "voice-ready"];
const AUM_SCALE = 1.03;

/**
 * Customer ownership policy (per Nora 2026-05-06):
 *   Junior: 77 customers (lowest AUM tier)
 *   Mid-level: 296 customers
 *   Manager: the remainder (222, highest AUM clients)
 * Manager retains team-wide *visibility* via bookScope.allInTeam, but they
 * also directly own their high-AUM clients so they always have a queue.
 */
const TIER_CAPS = { junior: 77, mid: 296 } as const;

function main() {
  const products = buildProducts();
  const rms = buildRms();

  // Precompute AUM by customer index, then sort indices by AUM desc to assign
  // ownership tier deterministically. Top 222 -> Manager, next 296 -> MidLevel,
  // bottom 77 -> Junior.
  const tierByIndex = computeTierByIndex(customerCount);

  const rankByIndex = computeRankByTier(customerCount, tierByIndex);
  const customers: CustomerProfile[] = Array.from({ length: customerCount }, (_, index) =>
    buildCustomer(index, rms, tierByIndex[index], rankByIndex[index])
  );
  const priorityHoldingTargets = computePriorityHoldingTargets(customers);
  const accounts: Account[] = [];
  const holdings: Holding[] = [];
  const transactions: Transaction[] = [];
  const lifecycleEvents: LifecycleEvent[] = [];
  const ruleCheckResults: RuleCheckResult[] = [];
  const agentRuns: AgentRun[] = [];
  const auditEvents: AuditEvent[] = [];
  const policyRules = buildPolicyRules();

  for (let index = 0; index < customerCount; index += 1) {
    const customer = customers[index];
    const targetHoldingCount = priorityHoldingTargets.get(customer.customerId);
    const customerAccounts = buildAccounts(customer, index, {
      forceNoHoldings: targetHoldingCount === 0,
      singleInvestmentAccount: targetHoldingCount !== undefined
    });
    accounts.push(...customerAccounts);
    const customerHoldings = buildHoldings(customer, customerAccounts, products, index, targetHoldingCount);
    holdings.push(...customerHoldings);
    transactions.push(...buildTransactions(customer, customerAccounts, customerHoldings, index));
    lifecycleEvents.push(...buildLifecycleEvents(customer, index));
    ruleCheckResults.push(...buildRuleChecks(customer, customerHoldings, policyRules, index));
    agentRuns.push(buildAgentRun(customer, index));
    auditEvents.push(...buildAuditEvents(customer, index));
  }

  const evidenceDraftCustomer = customers.find((customer) => customer.customerId === "cust_0023" && customer.rmId === "rm_junior_01");
  if (evidenceDraftCustomer) {
    agentRuns.push(buildEvidenceDraftRun(evidenceDraftCustomer));
    auditEvents.push(...buildEvidenceDraftAuditEvents(evidenceDraftCustomer));
  }

  rms[0].bookScope = {
    customerIds: customers.filter((c) => c.assignedRmTier === "Junior").map((c) => c.customerId)
  };
  rms[1].bookScope = {
    customerIds: customers.filter((c) => c.assignedRmTier === "MidLevel").map((c) => c.customerId)
  };
  // Manager keeps allInTeam visibility for governance; they own 222 customers
  // directly (queryable via customer.rmId === "rm_manager_01"), but can view
  // the entire team via bookScope.allInTeam.

  // Session events — one recent session.started per RM and one role.switched
  // signal so the audit pulse always shows session governance evidence.
  for (const session of buildSessionEvents(rms)) {
    auditEvents.push(session);
  }
  const transcripts = customers.slice(0, 12).map((customer, index) => buildTranscript(customer, index));

  const bundle: DataBundle = {
    rms,
    customers,
    accounts,
    products,
    holdings,
    transactions,
    marketSnapshots: buildMarketSnapshots(),
    researchArticles: buildResearchArticles(),
    lifecycleEvents,
    policyRules,
    ruleCheckResults,
    agentRuns,
    auditEvents,
    moduleConfigs: buildModuleConfigs(),
    transcripts
  };

  return writeBundle(bundle);
}

function buildRms(): RMUser[] {
  return [
    { rmId: "rm_junior_01", name: "Jensen Parker", email: "jensen.parker@dyna-demo.bank", role: "Junior", bookScope: { customerIds: [] } },
    { rmId: "rm_mid_01", name: "Adrian Lim", email: "adrian.lim@dyna-demo.bank", role: "MidLevel", bookScope: { customerIds: [] } },
    { rmId: "rm_manager_01", name: "Sofia Tan", email: "sofia.tan@dyna-demo.bank", role: "Manager", bookScope: { allInTeam: true } }
  ];
}

function buildProducts(): Product[] {
  const productCategories = categories.flatMap((category) =>
    Array.from({ length: category === "Fund" || category === "EquityBasket" ? 30 : 10 }, () => category)
  );
  return productCategories.map((category, index) => {
    const riskLevel = risks[(index + categories.indexOf(category)) % risks.length];
    return {
      productId: `prod_${String(index + 1).padStart(3, "0")}`,
      name: `${["Dyna", "Harbor", "Summit", "Meridian", "Crescent"][index % 5]} ${category} ${String(index + 1).padStart(2, "0")}`,
      family: `${category} Solutions`,
      category,
      geography: (["Local", "Regional", "Global"] as const)[index % 3],
      riskLevel,
      baseCurrency: investmentCurrencies[(index + Math.floor(index / categories.length)) % investmentCurrencies.length],
      fees: { managementBps: 25 + (index % 9) * 10, entryBps: category === "Deposit" ? 0 : 50 },
      inceptionDate: dateDaysAgo(2400 - index * 11),
      description: `Demo ${category.toLowerCase()} product used for RM workflow and traceability examples.`
    };
  });
}

function computeTierByIndex(count: number): Record<number, "Junior" | "MidLevel" | "Manager"> {
  const aumByIndex = Array.from({ length: count }, (_, i) => buildAum(i));
  const sorted = Array.from(aumByIndex.keys()).sort((a, b) => aumByIndex[b] - aumByIndex[a]);
  const map: Record<number, "Junior" | "MidLevel" | "Manager"> = {};
  sorted.forEach((index, rank) => {
    if (rank < count - TIER_CAPS.junior - TIER_CAPS.mid) {
      // Top slice = Manager (222 of 595)
      map[index] = "Manager";
    } else if (rank < count - TIER_CAPS.junior) {
      // Middle slice = Mid-level (296)
      map[index] = "MidLevel";
    } else {
      // Bottom slice = Junior (77)
      map[index] = "Junior";
    }
  });
  return map;
}

function computeRankByTier(count: number, tierByIndex: Record<number, "Junior" | "MidLevel" | "Manager">) {
  const ranks: Record<number, number> = {};
  const counters: Record<"Junior" | "MidLevel" | "Manager", number> = {
    Junior: 0,
    MidLevel: 0,
    Manager: 0
  };
  for (let index = 0; index < count; index += 1) {
    const tier = tierByIndex[index];
    ranks[index] = counters[tier];
    counters[tier] += 1;
  }
  return ranks;
}

function buildCustomer(index: number, rms: RMUser[], tier: "Junior" | "MidLevel" | "Manager", tierRank: number): CustomerProfile {
  const firstName = tier === "Junior" ? juniorFirstNames[tierRank % juniorFirstNames.length] : firstNames[index % firstNames.length];
  const lastName =
    tier === "Junior"
      ? juniorLastNames[(tierRank * 13) % juniorLastNames.length]
      : lastNames[(index * 7) % lastNames.length];
  const totalAum = buildAum(index);
  const segment = segmentForAum(totalAum);
  const serviceTier = serviceTierForSegment(segment);
  const assignedRmTier = tier;
  const rm = tier === "Junior" ? rms[0] : tier === "MidLevel" ? rms[1] : rms[2];
  const tags = buildTags(index, serviceTier);
  const name = `${firstName} ${lastName}`;
  const nextReviewDate = buildNextReviewDate(index);
  const household = buildHousehold(index, lastName);

  // Priority score formula (see docs/SCORING.md):
  //   38 base
  //   + tags * 11   (each priority tag adds weight)
  //   + 12 if a recent High-importance lifecycle signal exists
  //   + 8  if next review is overdue
  //   + index % 13  (bounded jitter for demo variety)
  // Capped at 98. Customizable per institution preset.
  const recentHighEvent = tags.includes("Lifecycle") || tags.includes("HighValue");
  const eventBoost = recentHighEvent ? 12 : tags.includes("MarketMove") ? 6 : 0;
  const reviewOverdue = nextReviewDate < now.toISOString().slice(0, 10);
  const reviewBoost = reviewOverdue ? 8 : 0;
  const rawPriorityScore = 40 + tags.length * 11 + eventBoost + reviewBoost + (index % 13);
  const zeroAumPenalty = totalAum === 0 ? 40 : 0;
  const priorityScore = Math.min(98, Math.max(38, rawPriorityScore - zeroAumPenalty));

  // Suitability questionnaire — typically valid for 12 months. Spread expiry
  // across customers so demo always shows some Valid / Expiring / Expired.
  const suitabilityAgeDays = 45 + (index * 17) % 340;
  const suitabilityCompletedAt = dateDaysAgo(suitabilityAgeDays);
  const suitabilityExpiresAt = dateDaysAgo(suitabilityAgeDays - 365);
  const daysToExpiry = -(suitabilityAgeDays - 365);
  const riskReviewAgeDays = 45 + (index * 19) % 455;
  const riskProfileReviewedAt = dateDaysAgo(riskReviewAgeDays);
  const riskProfileExpiresAt = dateDaysAgo(riskReviewAgeDays - 365);
  const knowledgeStatus: CustomerProfile["knowledgeAssessmentStatus"] =
    daysToExpiry < 0 ? "Expired" : daysToExpiry < 30 ? "Expiring" : index % 23 === 0 ? "Pending" : "Valid";

  // Funding currency — most Asian retail clients are local currency funded.
  const fundingCurrency: CustomerProfile["fundingCurrency"] =
    index % 3 === 0 ? "HKD" : index % 5 === 0 ? "JPY" : index % 7 === 0 ? "USD" : "SGD";

  // AUM trend & 30d net flow. Synthesized; production reads from transaction history.
  const aumYoyChangePct = roundMoney(((index % 31) - 12) + (recentHighEvent ? 4 : 0));
  const netFlow30d = roundMoney(
    totalAum *
      (tags.includes("DormantCash")
        ? -0.02 - ((index % 7) * 0.005)
        : tags.includes("HighValue")
        ? 0.015 + ((index % 11) * 0.002)
        : ((index % 11) - 5) * 0.003)
  );

  return {
    customerId: `cust_${String(index + 1).padStart(4, "0")}`,
    rmId: rm.rmId,
    name,
    avatarInitials: `${firstName[0]}${lastName[0]}`,
    householdId: household.householdId,
    householdRole: household.householdRole,
    age: 32 + (index % 34),
    gender: (["F", "M", "X"] as const)[index % 3],
    birthDate: dateYearsAgo(32 + (index % 34)),
    profession: professions[index % professions.length],
    incomeBand: index % 5 === 0 ? "USD 300k-600k" : index % 3 === 0 ? "USD 180k-300k" : "USD 90k-180k",
    location: { city: cities[index % cities.length], country: index % 3 === 0 ? "Hong Kong" : "Singapore" },
    segment,
    riskProfile: risks[index % risks.length],
    totalAum,
    currency: "USD",
    tags,
    priorityScore,
    lastContactedAt: buildLastContactedAt(index, tierRank),
    nextReviewDate,
    hasDormantClientSignal: totalAum === 0 || index % 15 === 0 || index % 137 === 0,
    serviceTier,
    assignedRmTier,
    advisoryPermissionLevel: index % 11 === 0 ? "Restricted" : "AdvisorMediated",
    riskProfileReviewedAt,
    riskProfileExpiresAt,
    suitabilityCompletedAt,
    suitabilityExpiresAt,
    knowledgeAssessmentStatus: knowledgeStatus,
    fundingCurrency,
    aumYoyChangePct,
    netFlow30d
  };
}

function buildHousehold(
  index: number,
  lastName: string
): Pick<CustomerProfile, "householdId" | "householdRole"> {
  if (lastName === "Yamamoto" && [19, 78, 137].includes(index)) {
    return {
      householdId: "hh_yamamoto_01",
      householdRole: index === 19 ? "Primary" : index === 78 ? "Spouse" : "Child"
    };
  }
  if (index % 71 === 0) {
    return { householdId: `hh_family_${String(Math.floor(index / 71)).padStart(2, "0")}`, householdRole: "Primary" };
  }
  if (index % 71 === 1) {
    return { householdId: `hh_family_${String(Math.floor((index - 1) / 71)).padStart(2, "0")}`, householdRole: "Spouse" };
  }
  if (index % 173 === 0) {
    return { householdId: `hh_${lastName.toLowerCase()}_fo`, householdRole: "FamilyOffice" };
  }
  return { householdRole: "None" };
}

function segmentForAum(totalAum: number): CustomerProfile["segment"] {
  if (totalAum >= 3_475_000) return "UHNW";
  if (totalAum >= 1_250_000) return "HNW";
  if (totalAum >= 420_000) return "Affluent";
  return "Mass";
}

function serviceTierForSegment(segment: CustomerProfile["segment"]): CustomerProfile["serviceTier"] {
  if (segment === "UHNW") return "Private";
  if (segment === "HNW") return "VIP";
  if (segment === "Affluent") return "Premium";
  return "Standard";
}

function computePriorityHoldingTargets(customers: CustomerProfile[]) {
  const targets = new Map<string, number>();
  const targetPatterns: Record<string, number[]> = {
    rm_junior_01: [2, 4, 5, 3, 10, 4, 2, 5, 3, 4],
    rm_mid_01: [4, 2, 6, 3, 5, 10, 2, 4, 3, 3],
    rm_manager_01: [5, 3, 4, 2, 10, 4, 3, 6, 2, 3]
  };
  for (const rmId of ["rm_junior_01", "rm_mid_01", "rm_manager_01"]) {
    const targetPattern = targetPatterns[rmId];
    customers
      .filter((customer) => customer.rmId === rmId)
      .sort((a, b) => b.priorityScore - a.priorityScore || b.totalAum - a.totalAum)
      .slice(0, 10)
      .forEach((customer, index) => {
        targets.set(customer.customerId, targetPattern[index]);
      });
  }
  return targets;
}

function buildAccounts(
  customer: CustomerProfile,
  index: number,
  options: { forceNoHoldings?: boolean; singleInvestmentAccount?: boolean } = {}
): Account[] {
  const noHoldings = options.forceNoHoldings || (!options.singleInvestmentAccount && (index === 10 || (index > 10 && index % 97 === 0)));
  const termDepositUsd = noHoldings || index % 4 !== 0 ? 0 : roundMoney(customer.totalAum * (0.06 + (index % 7) * 0.012));
  const cashUsd = noHoldings ? customer.totalAum : roundMoney(customer.totalAum * (0.06 + rng.next() * 0.17));
  const investedUsd = roundMoney(customer.totalAum - cashUsd - termDepositUsd);
  const primaryCurrency = customer.fundingCurrency;
  const secondaryCurrency = investmentCurrencies[(investmentCurrencies.indexOf(primaryCurrency) + 1 + (index % 3)) % investmentCurrencies.length];
  let tertiaryCurrency = investmentCurrencies[(investmentCurrencies.indexOf(primaryCurrency) + 2 + (index % 2)) % investmentCurrencies.length];
  if (tertiaryCurrency === primaryCurrency || tertiaryCurrency === secondaryCurrency) {
    tertiaryCurrency = investmentCurrencies.find((currency) => currency !== primaryCurrency && currency !== secondaryCurrency) ?? tertiaryCurrency;
  }
  const secondaryInvestedUsd = investedUsd > 0 && !options.singleInvestmentAccount && index % 5 === 0 ? roundMoney(investedUsd * (0.14 + (index % 5) * 0.025)) : 0;
  const tertiaryInvestedUsd = investedUsd > 0 && !options.singleInvestmentAccount && index % 31 === 0 ? roundMoney(investedUsd * 0.08) : 0;
  const primaryInvestedUsd = roundMoney(investedUsd - secondaryInvestedUsd - tertiaryInvestedUsd);
  const accounts: Account[] = [
    {
      accountId: `${customer.customerId}_cash`,
      customerId: customer.customerId,
      type: "Cash",
      currency: primaryCurrency,
      cashBalance: roundCurrency(fromUsd(cashUsd, primaryCurrency), primaryCurrency),
      marketValue: 0,
      status: customer.tags.includes("DormantCash") ? "Dormant" : "Active",
      openedAt: dateDaysAgo(1200 + rng.int(0, 900))
    },
    {
      accountId: `${customer.customerId}_inv`,
      customerId: customer.customerId,
      type: "Investment",
      currency: primaryCurrency,
      cashBalance: 0,
      marketValue: roundCurrency(fromUsd(primaryInvestedUsd, primaryCurrency), primaryCurrency),
      status: "Active",
      openedAt: dateDaysAgo(1000 + rng.int(0, 900))
    }
  ];
  if (termDepositUsd > 0) {
    accounts.push({
      accountId: `${customer.customerId}_td_${primaryCurrency.toLowerCase()}`,
      customerId: customer.customerId,
      type: "TermDeposit",
      currency: primaryCurrency,
      cashBalance: 0,
      marketValue: roundCurrency(fromUsd(termDepositUsd, primaryCurrency), primaryCurrency),
      status: "Active",
      openedAt: dateDaysAgo(180 + rng.int(0, 1000))
    });
  }
  if (secondaryInvestedUsd > 0) {
    accounts.push({
      accountId: `${customer.customerId}_inv_${secondaryCurrency.toLowerCase()}`,
      customerId: customer.customerId,
      type: "Investment",
      currency: secondaryCurrency,
      cashBalance: 0,
      marketValue: roundCurrency(fromUsd(secondaryInvestedUsd, secondaryCurrency), secondaryCurrency),
      status: "Active",
      openedAt: dateDaysAgo(700 + rng.int(0, 900))
    });
  }
  if (tertiaryInvestedUsd > 0) {
    accounts.push({
      accountId: `${customer.customerId}_inv_${tertiaryCurrency.toLowerCase()}`,
      customerId: customer.customerId,
      type: "Investment",
      currency: tertiaryCurrency,
      cashBalance: 0,
      marketValue: roundCurrency(fromUsd(tertiaryInvestedUsd, tertiaryCurrency), tertiaryCurrency),
      status: "Active",
      openedAt: dateDaysAgo(620 + rng.int(0, 900))
    });
  }
  return accounts;
}

function buildHoldings(customer: CustomerProfile, accounts: Account[], products: Product[], index: number, targetHoldingCount?: number): Holding[] {
  if (customer.totalAum === 0 || targetHoldingCount === 0 || (targetHoldingCount === undefined && (index === 10 || (index > 10 && index % 97 === 0)))) {
    return [];
  }

  const investmentAccounts = accounts.filter((account) => account.type === "Investment" && account.marketValue > 0);
  const invested = investmentAccounts.reduce((sum, account) => sum + toUsd(account.marketValue, account.currency), 0);
  const holdingCount = targetHoldingCount ?? (index < 10 || (index >= 50 && index < 60) ? 32 + (index % 6) : index % 89 === 0 ? 1 : 2 + (index % 7));
  const categoryFilter =
    index === 11 || index % 83 === 0 ? "ETF" :
    index === 12 || index % 79 === 0 ? "Fund" :
    index === 13 || index % 73 === 0 ? "Deposit" :
    undefined;
  const pool = categoryFilter ? products.filter((product) => product.category === categoryFilter) : products;
  let remainingCount = holdingCount;
  let globalHoldingIndex = 0;
  return investmentAccounts.flatMap((investmentAccount, accountIndex) => {
    const minimumForRemainingAccounts = investmentAccounts.length - accountIndex - 1;
    const accountCount =
      accountIndex === investmentAccounts.length - 1
        ? Math.max(1, remainingCount)
        : Math.max(
            1,
            Math.min(
              remainingCount - minimumForRemainingAccounts,
              Math.round((holdingCount * toUsd(investmentAccount.marketValue, investmentAccount.currency)) / invested)
            )
          );
    remainingCount -= accountCount;
    const currencyPool = pool.filter((product) => product.baseCurrency === investmentAccount.currency);
    const accountPool = currencyPool.length > 0 ? currencyPool : pool;
    const weights = Array.from({ length: accountCount }, () => 1 + rng.next() * 4);
    const totalWeight = weights.reduce((sum, item) => sum + item, 0);

    return weights.map((weight, holdingIndex) => {
      const isLast = holdingIndex === weights.length - 1;
      const allocatedBefore = weights
        .slice(0, holdingIndex)
        .reduce((sum, item) => roundCurrency(sum + (investmentAccount.marketValue * item) / totalWeight, investmentAccount.currency), 0);
      const value = isLast
        ? roundCurrency(investmentAccount.marketValue - allocatedBefore, investmentAccount.currency)
        : roundCurrency((investmentAccount.marketValue * weight) / totalWeight, investmentAccount.currency);
      const product = accountPool[(index * 13 + globalHoldingIndex * 7) % accountPool.length];
      globalHoldingIndex += 1;
      return {
        holdingId: `${customer.customerId}_hold_${String(globalHoldingIndex).padStart(2, "0")}`,
        customerId: customer.customerId,
        accountId: investmentAccount.accountId,
        productId: product.productId,
        value,
        currency: investmentAccount.currency,
        units: roundMoney(value / (50 + (holdingIndex % 9) * 7)),
        avgCostPrice: 50 + (holdingIndex % 9) * 7,
        pctOfAum: roundMoney((toUsd(value, investmentAccount.currency) / customer.totalAum) * 100),
        riskStatus: isRiskMismatch(customer.riskProfile, product.riskLevel) ? "mismatch" : "aligned",
        openedAt: dateDaysAgo(60 + rng.int(0, 900)),
        updatedAt: dateDaysAgo(rng.int(0, 45))
      };
    });
  });
}

function buildTransactions(customer: CustomerProfile, accounts: Account[], holdings: Holding[], index: number): Transaction[] {
  const count = index < 10 ? 100 : index < 50 ? 10 + (index % 21) : 2 + (index % 6);
  const accountById = new Map(accounts.map((account) => [account.accountId, account]));
  const investmentAccount = accounts.find((account) => account.type === "Investment")!;
  const cashAccount = accounts.find((account) => account.type === "Cash") ?? investmentAccount;
  return Array.from({ length: count }, (_, txIndex) => {
    const holding = holdings.length > 0 ? holdings[txIndex % holdings.length] : undefined;
    const account = holding ? accountById.get(holding.accountId) ?? investmentAccount : cashAccount;
    const action = holding ? (["BUY", "SELL", "DIVIDEND", "FEE"] as const)[txIndex % 4] : (["DEPOSIT", "WITHDRAW"] as const)[txIndex % 2];
    const price = holding?.avgCostPrice ?? 1;
    const quantity = action === "FEE" ? 1 : roundMoney(4 + rng.next() * 60);
    const totalAmount = action === "FEE" ? roundMoney(12 + rng.next() * 88) : roundMoney(quantity * price);
    return {
      transactionId: `${customer.customerId}_tx_${String(txIndex + 1).padStart(3, "0")}`,
      customerId: customer.customerId,
      accountId: account.accountId,
      productId: holding?.productId,
      action,
      quantity,
      price,
      totalAmount,
      currency: holding?.currency ?? account.currency,
      tradeDate: dateDaysAgo(txIndex * 5 + (index % 4)),
      valueDate: dateDaysAgo(txIndex * 5 + (index % 4) - 2)
    };
  });
}

function buildLifecycleEvents(customer: CustomerProfile, index: number): LifecycleEvent[] {
  return [0, 1, 2].map((offset) => {
    const type = (["Review", "Maturity", "LifeEvent", "Market", "Portfolio"] as const)[(index + offset) % 5];
    const title = ["Annual review due", "Structured note maturity", "Liquidity planning", "Market movement", "Portfolio drift"][(index + offset) % 5];
    const date = dateDaysAgo(7 + offset * 23 + (index % 9));
    return {
      eventId: `${customer.customerId}_event_${offset + 1}`,
      customerId: customer.customerId,
      date,
      type,
      title,
      description: lifecycleDescription(type, date),
      importance: offset === 0 && customer.priorityScore > 75 ? "High" : offset === 1 ? "Medium" : "Low"
    };
  });
}

function lifecycleDescription(type: LifecycleEvent["type"], date: string) {
  const today = now.toISOString().slice(0, 10);
  const timing = date < today ? "past" : date === today ? "today" : "future";
  switch (type) {
    case "Review":
      if (timing === "past") return `Review was due on ${date}; prepare agenda, holdings context, and approval evidence.`;
      if (timing === "today") return `Review is due today, ${date}; prepare agenda, holdings context, and approval evidence.`;
      return `Review upcoming on ${date}; prepare agenda, holdings context, and approval evidence.`;
    case "Maturity":
      if (timing === "past") return `Matured on ${date}; prepare reinvestment follow-up and liquidity notes.`;
      if (timing === "today") return `Matures today, ${date}; prepare reinvestment follow-up and liquidity notes.`;
      return `Maturity approaching on ${date}; prepare reinvestment context and liquidity notes.`;
    case "LifeEvent":
      if (timing === "past") return `Life event was recorded on ${date}; prepare a focused follow-up before the next client touch.`;
      if (timing === "today") return `Life event is scheduled for today, ${date}; prepare a focused client check-in.`;
      return `Life event upcoming on ${date}; prepare a focused check-in before the next client touch.`;
    case "Market":
      if (timing === "past") return `Market movement was recorded on ${date}; prepare a concise impact summary.`;
      if (timing === "today") return `Market movement is active today, ${date}; prepare a concise impact summary.`;
      return `Market movement may affect the portfolio on ${date}; prepare a concise impact summary.`;
    case "Portfolio":
      if (timing === "past") return `Portfolio drift was visible on ${date}; prepare the holdings evidence before review.`;
      if (timing === "today") return `Portfolio drift is visible today, ${date}; prepare the holdings evidence before review.`;
      return `Portfolio drift review upcoming on ${date}; prepare the holdings evidence before review.`;
  }
}

function buildPolicyRules(): InstitutionPolicyRule[] {
  return [
    { ruleId: "rule_suitability_01", personaId, type: "Suitability", description: "Riskier products require documented risk alignment review.", severity: "Warning", source: "DemoRule", enabled: true },
    { ruleId: "rule_draft_approval_01", personaId, type: "DraftApproval", description: "Junior RM client-facing drafts require review.", severity: "Warning", source: "InstitutionPlaceholder", enabled: true },
    { ruleId: "rule_disclaimer_01", personaId, type: "Disclaimer", description: "Client-facing outputs must include institution disclaimer.", severity: "Info", source: "InstitutionPlaceholder", enabled: true }
  ];
}

function buildRuleChecks(customer: CustomerProfile, holdings: Holding[], rules: InstitutionPolicyRule[], index: number): RuleCheckResult[] {
  return [
    {
      resultId: `${customer.customerId}_check_suitability`,
      ruleId: rules[0].ruleId,
      customerId: customer.customerId,
      passed: !holdings.some((holding) => holding.riskStatus === "mismatch"),
      requiredAction: holdings.some((holding) => holding.riskStatus === "mismatch") ? "Review" : "None",
      explanation: "Risk alignment is evaluated by demo rule only; institution policy remains authoritative."
    },
    {
      resultId: `${customer.customerId}_check_draft`,
      ruleId: rules[1].ruleId,
      customerId: customer.customerId,
      rmId: customer.rmId,
      passed: customer.assignedRmTier !== "Junior",
      requiredAction: customer.assignedRmTier === "Junior" ? "Approval" : "None",
      explanation: "Junior RM drafts require approval before client-facing use."
    },
    {
      resultId: `${customer.customerId}_check_disclaimer_${index}`,
      ruleId: rules[2].ruleId,
      customerId: customer.customerId,
      passed: true,
      requiredAction: "None",
      explanation: "Demo disclaimer is present."
    }
  ];
}

function buildAgentRun(customer: CustomerProfile, index: number): AgentRun {
  const startedAt = new Date(now.getTime() - index * 60_000);
  const finishedAt = new Date(startedAt.getTime() + 180 + (index % 20) * 12);
  return {
    runId: `${customer.customerId}_run_talking_points`,
    channel: "talking_points",
    workflowId: "wf_demo_talking_points",
    personaId,
    customerId: customer.customerId,
    rmId: customer.rmId,
    roleAtRun: customer.assignedRmTier,
    inputDigest: `Prepare talking points for ${customer.name}`,
    sourceRefs: [`customer:${customer.customerId}`, "holdings", "lifecycle-events", "policy-rules"],
    steps: [
      { name: "Load customer 360", inputRef: customer.customerId, output: { riskProfile: customer.riskProfile, totalAum: customer.totalAum }, source: "LocalJsonRepo" },
      { name: "Apply demo governance", output: { role: customer.assignedRmTier }, source: "InstitutionPolicyRule" },
      { name: "Generate RM summary", output: "Meeting preparation summary", source: "DemoFallback" }
    ],
    output: { bullets: ["Review lifecycle trigger", "Confirm liquidity needs", "Explain any risk mismatch plainly"] },
    fallbackMode: true,
    redactionLevel: "Summary",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    latencyMs: finishedAt.getTime() - startedAt.getTime()
  };
}

function buildAuditEvents(customer: CustomerProfile, index: number): AuditEvent[] {
  const base = new Date(now.getTime() - index * 45_000);
  const events: AuditEvent[] = [
    {
      eventId: `${customer.customerId}_audit_opened`,
      type: "client.opened",
      actorId: customer.rmId,
      actorRole: customer.assignedRmTier,
      customerId: customer.customerId,
      timestamp: offsetIso(base, 0)
    },
    {
      eventId: `${customer.customerId}_audit_ai`,
      type: "ai.output.shown",
      actorId: customer.rmId,
      actorRole: customer.assignedRmTier,
      customerId: customer.customerId,
      runId: `${customer.customerId}_run_talking_points`,
      timestamp: offsetIso(base, 1)
    }
  ];

  if (index % 9 === 0 && customer.assignedRmTier !== "Junior") {
    events.push({
      eventId: `${customer.customerId}_audit_sent`,
      type: "draft.sent",
      actorId: customer.rmId,
      actorRole: customer.assignedRmTier,
      customerId: customer.customerId,
      timestamp: offsetIso(base, 4),
      payload: {
        source: "seeded-history",
        note: "Historical sent event only; v1.0 approval queue is live draft_assist output."
      }
    });
  }

  return events;
}

function buildEvidenceDraftRun(customer: CustomerProfile): AgentRun {
  const runId = "demo_lifecycle_draft_run";
  const createdAt = demoIso(4, 10, 20);
  const returnedAt = demoIso(3, 16, 10);
  const editedAt = demoIso(2, 11, 35);
  const approvedAt = demoIso(1, 9, 45);
  const sentAt = demoIso(1, 10, 5);
  const finalDraft = [
    `Dear ${customer.name.split(" ")[0]},`,
    "",
    "I have prepared your annual review pack and would like to walk through the current holdings, liquidity needs, and risk profile evidence together.",
    "",
    "Could we schedule a 25-minute review meeting this week? I will bring the portfolio summary, the suitability status, and the open review items so we can confirm the next service steps clearly.",
    "",
    "Regards,",
    "Jensen"
  ].join("\n");

  return {
    runId,
    channel: "email",
    moduleId: "draft_assist",
    requestedRuntime: "deterministic",
    backend: "deterministic",
    model: "demo-seed",
    llmProvider: "local-demo",
    skillVersion: "seed-run@evidence-v1",
    state: "sent",
    approvalRequired: "manager-approval",
    why: "Client review pack prepared for Manager review because the originating RM is Junior.",
    vocabularyAdjusted: true,
    cached: true,
    workflowId: "wf_demo_lifecycle_evidence",
    personaId,
    customerId: customer.customerId,
    rmId: "rm_junior_01",
    roleAtRun: "Junior",
    inputDigest: `Prepare Client Review Pack email for ${customer.name}`,
    sourceRefs: ["customer-profile", "holdings", "lifecycle-events", "institution-policy-rules"],
    steps: [
      {
        name: "Load client context",
        inputRef: "customer-profile",
        output: {
          customerName: customer.name,
          riskProfile: customer.riskProfile,
          serviceTier: customer.serviceTier
        },
        source: "Customer profile"
      },
      {
        name: "Initial draft prepared",
        output: {
          subject: "Annual review pack and income outlook",
          excerpt: "The first version included a yield projection line that required Manager review."
        },
        source: "Draft Assist"
      },
      {
        name: "Manager return recorded",
        output: {
          from: "prepared",
          to: "rejected",
          actorId: "rm_manager_01",
          actorRole: "Manager",
          note: "Remove the yield projection line - replace with review-meeting invitation.",
          timestamp: returnedAt
        },
        source: "Review history"
      },
      {
        name: "RM revision recorded",
        output: {
          from: "rejected",
          to: "edited",
          actorId: "rm_junior_01",
          actorRole: "Junior",
          note: "Removed yield projection and replaced it with review meeting invitation.",
          timestamp: editedAt
        },
        source: "Review history"
      },
      {
        name: "Approval chain completed",
        output: {
          createdAt,
          approvedAt,
          sentAt,
          finalState: "sent"
        },
        source: "Review history"
      }
    ],
    output: {
      headline: "Client Review Pack email",
      channel: "email",
      formatLabel: "Client Review Pack",
      subject: "Annual review meeting and portfolio evidence",
      draft: finalDraft,
      artifactText: finalDraft,
      artifactKind: "pdf",
      approvalChecklist: [
        "Yield projection removed before approval.",
        "Review meeting invitation added in the final draft.",
        "Manager review completed before send."
      ],
      why: "The final draft reflects the Manager return note and keeps client-facing language reviewable."
    },
    fallbackMode: true,
    redactionLevel: "Summary",
    startedAt: createdAt,
    finishedAt: sentAt,
    latencyMs: Date.parse(sentAt) - Date.parse(createdAt)
  };
}

function buildEvidenceDraftAuditEvents(customer: CustomerProfile): AuditEvent[] {
  const runId = "demo_lifecycle_draft_run";
  return [
    {
      eventId: "demo_lifecycle_draft_created",
      type: "draft.created",
      actorId: "rm_junior_01",
      actorRole: "Junior",
      customerId: customer.customerId,
      runId,
      timestamp: demoIso(4, 10, 20),
      payload: {
        channel: "email",
        approvalRequired: "manager-approval",
        note: "Created Client Review Pack draft for Manager review."
      }
    },
    {
      eventId: "demo_lifecycle_draft_returned",
      type: "draft.rejected",
      actorId: "rm_manager_01",
      actorRole: "Manager",
      customerId: customer.customerId,
      runId,
      timestamp: demoIso(3, 16, 10),
      payload: {
        transition: "rejected",
        previousState: "prepared",
        nextState: "rejected",
        note: "Remove the yield projection line - replace with review-meeting invitation."
      }
    },
    {
      eventId: "demo_lifecycle_draft_edited",
      type: "draft.edited",
      actorId: "rm_junior_01",
      actorRole: "Junior",
      customerId: customer.customerId,
      runId,
      timestamp: demoIso(2, 11, 35),
      payload: {
        transition: "edited",
        previousState: "rejected",
        nextState: "edited",
        note: "Removed yield projection and replaced it with review meeting invitation."
      }
    },
    {
      eventId: "demo_lifecycle_draft_approved",
      type: "draft.approved",
      actorId: "rm_manager_01",
      actorRole: "Manager",
      customerId: customer.customerId,
      runId,
      timestamp: demoIso(1, 9, 45),
      payload: {
        transition: "approved",
        previousState: "edited",
        nextState: "approved",
        note: "Approved after the yield projection was removed."
      }
    },
    {
      eventId: "demo_lifecycle_draft_sent",
      type: "draft.sent",
      actorId: "rm_junior_01",
      actorRole: "Junior",
      customerId: customer.customerId,
      runId,
      timestamp: demoIso(1, 10, 5),
      payload: {
        transition: "sent",
        previousState: "approved",
        nextState: "sent",
        note: "Sent approved review meeting invitation to the client."
      }
    }
  ];
}

function buildTranscript(customer: CustomerProfile, index: number): Transcript {
  const outbound = index % 3 !== 1;
  const scenario: Transcript["scenario"] = outbound
    ? index % 4 === 0
      ? "maturity_reminder"
      : "meeting_confirmation"
    : "inbound_rm_assist";
  const channel: Transcript["channel"] = outbound ? "voice_outbound" : "voice_inbound";
  const startedAt = new Date(now.getTime() - (index * 37 + 18) * 60 * 1000).toISOString();
  const endedAt = new Date(Date.parse(startedAt) + (5 + (index % 4)) * 60 * 1000).toISOString();
  return {
    transcriptId: `voice_tx_${customer.customerId}`,
    customerId: customer.customerId,
    rmId: customer.rmId,
    channel,
    scenario,
    integrationMode: "web_call_simulator",
    externalCallId: `webcall_${customer.customerId}_${index}`,
    handoffRequired: !outbound,
    startedAt,
    endedAt,
    summary: outbound
      ? `${customer.name} confirmed availability for a short service check and asked the RM to bring review evidence.`
      : `${customer.name} called in while the RM was busy; Beacon captured the concern and marked follow-up required.`,
    turns: [
      {
        speaker: "system",
        text: outbound ? "Beacon placed a simulated outbound call." : "Beacon answered an inbound simulated call.",
        timestamp: startedAt
      },
      {
        speaker: "customer",
        text: outbound
          ? "A short check-in works. Please make sure the portfolio evidence is ready before we speak."
          : "I wanted to check whether anything has changed in my portfolio review schedule.",
        timestamp: new Date(Date.parse(startedAt) + 90_000).toISOString()
      },
      {
        speaker: "rm",
        text: "I will prepare the evidence trail and follow up with a concise note for review.",
        timestamp: new Date(Date.parse(startedAt) + 210_000).toISOString()
      }
    ]
  };
}

function buildMarketSnapshots(): MarketSnapshot[] {
  return Array.from({ length: 30 }, (_, index) => ({
    snapshotId: `market_${String(index + 1).padStart(2, "0")}`,
    date: dateDaysAgo(index),
    headline: index === 0 ? "Asia markets steady as rate expectations stabilize" : "Demo market snapshot for RM briefing",
    sentiment: index % 5 === 0 ? "Cautious" : index % 4 === 0 ? "Positive" : "Neutral",
    indices: [
      { name: "MSCI Asia ex-Japan", value: 702 + index, changePct: roundMoney((rng.next() - 0.45) * 1.8) },
      { name: "US 10Y", value: 4.1 + index / 100, changePct: roundMoney((rng.next() - 0.45) * 0.2) }
    ]
  }));
}

function buildResearchArticles(): ResearchArticle[] {
  return Array.from({ length: 12 }, (_, index) => ({
    articleId: `research_${String(index + 1).padStart(2, "0")}`,
    title: ["Income ideas for cautious investors", "Asia quality equities", "Currency hedging checklist", "Structured product risk review"][index % 4],
    date: dateDaysAgo(index * 6),
    summary: "Demo research article summary available for RM preparation and source trace.",
    tags: [categories[index % categories.length], risks[index % risks.length]]
  }));
}

function buildModuleConfigs(): ModuleConfig[] {
  return modules.map((moduleId, index) => ({
    personaId,
    moduleId,
    enabled: index < 9,
    config: { demo: true },
    version: 1,
    updatedAt: now.toISOString(),
    updatedBy: "system"
  }));
}

function buildTags(index: number, serviceTier: CustomerProfile["serviceTier"]): PriorityTag[] {
  const tags: PriorityTag[] = [];
  if (index % 13 === 0) tags.push("ReviewDue");
  if (index % 7 === 0) tags.push("Lifecycle");
  if (index % 11 === 0) tags.push("RiskMismatch");
  if (index % 13 === 0 || index % 137 === 0) tags.push("DormantCash");
  if (index % 17 === 0) tags.push("Maturity");
  if (serviceTier === "VIP" || serviceTier === "Private") tags.push("HighValue");
  if (index % 19 === 0) tags.push("MarketMove");
  return tags.length > 0 ? tags : ["ServiceWindow"];
}

function buildAum(index: number) {
  if (index > 20 && index % 15 === 0) return 0;
  if (index % 89 === 0) return roundMoney((2_420_000 + index * 3_250) * AUM_SCALE);
  if (index % 97 === 0) return roundMoney((118_000 + index * 940) * AUM_SCALE);
  if (index % 9 === 0) return roundMoney((1_230_000 + index * 5_150 + (index % 7) * 8_000) * AUM_SCALE);
  if (index % 4 === 0) return roundMoney((610_000 + index * 2_260 + (index % 11) * 5_500) * AUM_SCALE);
  return roundMoney((205_000 + index * 1_460 + (index % 13) * 4_250) * AUM_SCALE);
}

function buildSessionEvents(rms: RMUser[]): AuditEvent[] {
  const events: AuditEvent[] = [];
  rms.forEach((rm, idx) => {
    const sessionTime = new Date(now.getTime() - (idx * 11 + 4) * 60 * 1000).toISOString();
    events.push({
      eventId: `session_${rm.rmId}_started`,
      type: "session.started",
      actorId: rm.rmId,
      actorRole: rm.role,
      timestamp: sessionTime,
      payload: { source: "demo-login" }
    });
  });
  // Role escalation example — Junior asked to view a Manager-only surface.
  events.push({
    eventId: "session_role_switched",
    type: "session.switched",
    actorId: rms[2].rmId,
    actorRole: "Manager",
    timestamp: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
    payload: { from: "MidLevel", to: "Manager" }
  });
  return events;
}

function buildLastContactedAt(index: number, tierRank: number) {
  if (tierRank % 5 === 0) return dateDaysAgo(3 + (tierRank % 18));
  if (tierRank % 6 === 0) return dateDaysAgo(125 + (tierRank % 55));
  return dateDaysAgo(24 + ((index + tierRank * 3) % 82));
}

function buildNextReviewDate(index: number) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + ((index * 7) % 180) - 10);
  return date.toISOString().slice(0, 10);
}

function isRiskMismatch(customerRisk: RiskProfile, productRisk: RiskProfile) {
  return risks.indexOf(productRisk) - risks.indexOf(customerRisk) >= 1;
}

function dateDaysAgo(days: number) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function dateYearsAgo(years: number) {
  const date = new Date(now);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function offsetIso(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

function demoIso(daysAgo: number, hour: number, minute: number) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function writeBundle(bundle: DataBundle) {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  console.log(`Generated ${bundle.customers.length} customers, ${bundle.products.length} products, ${bundle.transactions.length} transactions.`);
}

function resolveNow() {
  const explicit = readNowArg();
  const date = explicit ?? localDateString(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T09:00:00.000Z`))) {
    throw new Error(`Invalid --now date "${date}". Use YYYY-MM-DD, for example --now=2026-07-07.`);
  }
  return new Date(`${date}T09:00:00.000Z`);
}

function readNowArg() {
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg.startsWith("--now=")) {
      return arg.slice("--now=".length);
    }
    if (arg === "--now") {
      return process.argv[index + 1];
    }
  }
  return process.env.BEACON_DATA_NOW;
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
