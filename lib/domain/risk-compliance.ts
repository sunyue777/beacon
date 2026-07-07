import type { CustomerProfile, Holding, Product, RiskProfile } from "@/lib/repo/types";
import { toUsd } from "@/lib/utils/currency";
import { daysUntil } from "./client-signals";

/**
 * Risk & compliance dimensions surfaced on the Customer 360 → Risk Alignment
 * tab. Each helper returns a structured result the UI renders without
 * additional logic. See docs/SCORING.md for the rule rationale and how to
 * customize per institution preset.
 */

export type ComplianceState = "Pass" | "Watch" | "Block" | "NotChecked";

export interface SuitabilityStatus {
  state: ComplianceState;
  completedAt: string;
  expiresAt: string;
  daysToExpiry: number;
  detail: string;
}

export interface ConcentrationRisk {
  state: ComplianceState;
  topPosition?: { name: string; pct: number };
  topCategory?: { category: string; pct: number };
  detail: string;
}

export interface CurrencyExposure {
  state: ComplianceState;
  fundingCurrency: CustomerProfile["fundingCurrency"];
  breakdown: { currency: string; pct: number }[];
  nonFundingPct: number;
  detail: string;
}

export interface LiquidityCompliance {
  state: ComplianceState;
  illiquidPct: number;
  detail: string;
}

export interface KnowledgeStatus {
  state: ComplianceState;
  status: CustomerProfile["knowledgeAssessmentStatus"];
  detail: string;
}

export interface RiskComplianceSummary {
  suitability: SuitabilityStatus;
  concentration: ConcentrationRisk;
  currency: CurrencyExposure;
  liquidity: LiquidityCompliance;
  knowledge: KnowledgeStatus;
  /** Highest severity across all dimensions — used for headline color. */
  worst: ComplianceState;
}

const BLOCK_RANK: Record<ComplianceState, number> = { Pass: 0, NotChecked: 1, Watch: 2, Block: 3 };

const ILLIQUID_CATEGORIES = new Set<Product["category"]>(["Structured", "Insurance", "Alternative"]);

/* ----------------------------- Suitability ----------------------------- */

export function getSuitabilityStatus(customer: CustomerProfile): SuitabilityStatus {
  const days = daysUntil(customer.suitabilityExpiresAt) ?? 0;
  let state: ComplianceState;
  let detail: string;
  if (days < 0) {
    state = "Block";
    detail = `Expired ${-days} days ago — block new advisory until refreshed.`;
  } else if (days <= 30) {
    state = "Watch";
    detail = `Renew within ${days} day(s).`;
  } else {
    state = "Pass";
    detail = `Valid for ${days} more days.`;
  }
  return {
    state,
    completedAt: customer.suitabilityCompletedAt,
    expiresAt: customer.suitabilityExpiresAt,
    daysToExpiry: days,
    detail
  };
}

/* ----------------------------- Concentration ----------------------------- */

export function getConcentrationRisk(holdings: Holding[], products: Product[]): ConcentrationRisk {
  if (holdings.length === 0) {
    return { state: "NotChecked", detail: "No holdings on file." };
  }
  const productById = new Map(products.map((p) => [p.productId, p]));
  const total = holdings.reduce((sum, h) => sum + toUsd(h.value, h.currency), 0) || 1;

  const positionPcts = holdings
    .map((h) => ({ name: productById.get(h.productId)?.name ?? h.productId, pct: (toUsd(h.value, h.currency) / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  const categoryTotals = new Map<string, number>();
  for (const h of holdings) {
    const category = productById.get(h.productId)?.category ?? "Other";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + toUsd(h.value, h.currency));
  }
  const sortedCategories = [...categoryTotals.entries()]
    .map(([category, value]) => ({ category, pct: (value / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  const topPosition = positionPcts[0];
  const topCategory = sortedCategories[0];
  const positionViolation = topPosition && topPosition.pct > 25;
  const categoryViolation = topCategory && topCategory.pct > 40;

  let state: ComplianceState = "Pass";
  let detail = `Top position ${topPosition.pct.toFixed(1)}%, top sector ${topCategory.pct.toFixed(1)}%.`;
  if (positionViolation && categoryViolation) {
    state = "Block";
    detail = `Single position ${topPosition.pct.toFixed(1)}% AND single category ${topCategory.pct.toFixed(1)}% — review concentration before advisory.`;
  } else if (positionViolation || categoryViolation) {
    state = "Watch";
    detail = positionViolation
      ? `Single position ${topPosition.name} at ${topPosition.pct.toFixed(1)}% exceeds 25% limit.`
      : `Single category ${topCategory.category} at ${topCategory.pct.toFixed(1)}% exceeds 40% limit.`;
  }

  return { state, topPosition, topCategory, detail };
}

/* ----------------------------- Currency exposure ----------------------------- */

export function getCurrencyExposure(
  customer: CustomerProfile,
  holdings: Holding[]
): CurrencyExposure {
  if (holdings.length === 0) {
    return {
      state: "NotChecked",
      fundingCurrency: customer.fundingCurrency,
      breakdown: [],
      nonFundingPct: 0,
      detail: "No holdings on file."
    };
  }
  const total = holdings.reduce((sum, h) => sum + toUsd(h.value, h.currency), 0) || 1;
  const ccyTotals = new Map<string, number>();
  for (const h of holdings) {
    ccyTotals.set(h.currency, (ccyTotals.get(h.currency) ?? 0) + toUsd(h.value, h.currency));
  }
  const breakdown = [...ccyTotals.entries()]
    .map(([currency, value]) => ({ currency, pct: Math.round((value / total) * 100) }))
    .sort((a, b) => b.pct - a.pct);

  const nonFundingPct = breakdown
    .filter((b) => b.currency !== customer.fundingCurrency)
    .reduce((sum, b) => sum + b.pct, 0);

  let state: ComplianceState;
  let detail: string;
  if (nonFundingPct >= 70) {
    state = "Watch";
    detail = `${nonFundingPct}% of portfolio outside ${customer.fundingCurrency} funding currency.`;
  } else {
    state = "Pass";
    detail = `${100 - nonFundingPct}% aligned with ${customer.fundingCurrency} funding.`;
  }

  return { state, fundingCurrency: customer.fundingCurrency, breakdown, nonFundingPct, detail };
}

/* ----------------------------- Liquidity ----------------------------- */

export function getLiquidityCompliance(holdings: Holding[], products: Product[]): LiquidityCompliance {
  if (holdings.length === 0) {
    return { state: "NotChecked", illiquidPct: 0, detail: "No holdings on file." };
  }
  const productById = new Map(products.map((p) => [p.productId, p]));
  const total = holdings.reduce((sum, h) => sum + toUsd(h.value, h.currency), 0) || 1;
  const illiquidValue = holdings
    .filter((h) => {
      const category = productById.get(h.productId)?.category;
      return category && ILLIQUID_CATEGORIES.has(category);
    })
    .reduce((sum, h) => sum + toUsd(h.value, h.currency), 0);
  const illiquidPct = Math.round((illiquidValue / total) * 100);

  let state: ComplianceState = "Pass";
  let detail = `Illiquid bucket ${illiquidPct}% (limit 35%).`;
  if (illiquidPct > 50) {
    state = "Block";
    detail = `Illiquid bucket ${illiquidPct}% — exceeds hard limit, restrict new structured/alt allocation.`;
  } else if (illiquidPct > 35) {
    state = "Watch";
    detail = `Illiquid bucket ${illiquidPct}% — over 35% guideline, review next allocation.`;
  }
  return { state, illiquidPct, detail };
}

/* ----------------------------- Knowledge & experience ----------------------------- */

export function getKnowledgeStatus(customer: CustomerProfile): KnowledgeStatus {
  const status = customer.knowledgeAssessmentStatus;
  if (status === "Expired") {
    return { state: "Block", status, detail: "K&E assessment expired — block complex products until renewed." };
  }
  if (status === "Expiring") {
    return { state: "Watch", status, detail: "K&E assessment expires within 30 days." };
  }
  if (status === "Pending") {
    return { state: "Watch", status, detail: "K&E assessment not yet completed." };
  }
  return { state: "Pass", status, detail: "K&E assessment valid." };
}

/* ----------------------------- Aggregate ----------------------------- */

export function getRiskComplianceSummary(
  customer: CustomerProfile,
  holdings: Holding[],
  products: Product[]
): RiskComplianceSummary {
  const suitability = getSuitabilityStatus(customer);
  const concentration = getConcentrationRisk(holdings, products);
  const currency = getCurrencyExposure(customer, holdings);
  const liquidity = getLiquidityCompliance(holdings, products);
  const knowledge = getKnowledgeStatus(customer);
  const states: ComplianceState[] = [
    suitability.state,
    concentration.state,
    currency.state,
    liquidity.state,
    knowledge.state
  ];
  const worst = states.reduce((acc, state) => (BLOCK_RANK[state] > BLOCK_RANK[acc] ? state : acc), "Pass" as ComplianceState);
  return { suitability, concentration, currency, liquidity, knowledge, worst };
}

export function complianceTone(state: ComplianceState): "danger" | "warning" | "success" | "muted" {
  if (state === "Block") return "danger";
  if (state === "Watch") return "warning";
  if (state === "Pass") return "success";
  return "muted";
}

/* =========================================================================== *
 *  Risk & portfolio alignment — aggregate view used by the Client 360
 *  Risk Alignment hero card. Combines the 5 compliance dimensions above
 *  into a single visual story: profile-vs-actual gauge, allocation drift,
 *  liquidity buckets, and AI-style factor breakdown.
 * =========================================================================== */

export type AlignmentBucket = "Equity" | "Fixed income" | "Cash" | "Alternatives" | "Structured";

export interface AllocationRow {
  bucket: AlignmentBucket;
  targetPct: number;
  actualPct: number;
  /** Drift > target band? */
  over: boolean;
  /** Drift < target band? */
  under: boolean;
}

export interface LiquidityBuckets {
  liquidPct: number;
  semiPct: number;
  illiquidPct: number;
  illiquidCap: number;
}

export interface AlignmentFactor {
  name: string;
  weight: number;
  desc: string;
}

export interface RiskAlignment {
  /** Stated profile, mapped to 1-9 numeric scale. */
  profileScore: number;
  /** Live portfolio risk, weighted by holding value, mapped to 1-9. */
  actualScore: number;
  /** actualScore - profileScore. Positive = portfolio runs hotter than profile. */
  gap: number;
  /** Headline state — Pass | Watch | Block depending on |gap| and other dims. */
  state: ComplianceState;
  /** Days since drift first crossed tolerance (demo: derived from priorityScore). */
  driftDays: number;
  allocation: AllocationRow[];
  liquidity: LiquidityBuckets;
  factors: AlignmentFactor[];
}

const RISK_TO_SCORE: Record<RiskProfile, number> = {
  Conservative: 1,
  ModConservative: 3,
  Moderate: 5,
  ModAggressive: 7,
  Aggressive: 9
};

/**
 * Target allocation per risk profile. These are demo defaults — a real
 * institution would expose them through ModuleConfig.
 */
const TARGET_BY_PROFILE: Record<RiskProfile, Record<AlignmentBucket, number>> = {
  Conservative:    { Equity: 20, "Fixed income": 55, Cash: 15, Alternatives: 5,  Structured: 5  },
  ModConservative: { Equity: 35, "Fixed income": 40, Cash: 12, Alternatives: 8,  Structured: 5  },
  Moderate:        { Equity: 45, "Fixed income": 30, Cash: 10, Alternatives: 10, Structured: 5  },
  ModAggressive:   { Equity: 60, "Fixed income": 20, Cash: 5,  Alternatives: 10, Structured: 5  },
  Aggressive:      { Equity: 75, "Fixed income": 10, Cash: 3,  Alternatives: 7,  Structured: 5  }
};

const EQUITY_CATEGORIES = new Set<Product["category"]>(["Fund", "ETF", "EquityBasket", "ModelPortfolio"]);
const FIXED_CATEGORIES = new Set<Product["category"]>(["Bond"]);
const CASH_CATEGORIES = new Set<Product["category"]>(["Deposit", "FX"]);
const ALT_CATEGORIES = new Set<Product["category"]>(["Alternative", "Insurance"]);
const STRUCT_CATEGORIES = new Set<Product["category"]>(["Structured"]);

/** Liquidity buckets for the donut. */
const LIQUID_CATEGORIES = new Set<Product["category"]>(["Deposit", "FX", "Bond", "ETF"]);
const SEMI_LIQUID_CATEGORIES = new Set<Product["category"]>(["Fund", "EquityBasket", "ModelPortfolio"]);
const ILLIQUID_BUCKET_CATEGORIES = new Set<Product["category"]>(["Structured", "Insurance", "Alternative"]);

function bucketOfCategory(category: Product["category"] | undefined): AlignmentBucket | "Unknown" {
  if (!category) return "Unknown";
  if (EQUITY_CATEGORIES.has(category)) return "Equity";
  if (FIXED_CATEGORIES.has(category)) return "Fixed income";
  if (CASH_CATEGORIES.has(category)) return "Cash";
  if (ALT_CATEGORIES.has(category)) return "Alternatives";
  if (STRUCT_CATEGORIES.has(category)) return "Structured";
  return "Unknown";
}

export function getRiskAlignment(
  customer: CustomerProfile,
  holdings: Holding[],
  products: Product[]
): RiskAlignment {
  const productById = new Map(products.map((p) => [p.productId, p]));
  const total = holdings.reduce((sum, h) => sum + toUsd(h.value, h.currency), 0) || 1;
  const profileScore = RISK_TO_SCORE[customer.riskProfile];

  // ---------- Actual portfolio score (value-weighted) ----------
  let weightedSum = 0;
  for (const h of holdings) {
    const product = productById.get(h.productId);
    const score = product ? RISK_TO_SCORE[product.riskLevel] : profileScore;
    weightedSum += score * toUsd(h.value, h.currency);
  }
  const actualScoreRaw = holdings.length > 0 ? weightedSum / total : profileScore;
  const actualScore = Math.round(actualScoreRaw * 10) / 10;
  const gap = Math.round((actualScore - profileScore) * 10) / 10;

  // ---------- Allocation rows ----------
  const target = TARGET_BY_PROFILE[customer.riskProfile];
  const buckets: AlignmentBucket[] = ["Equity", "Fixed income", "Cash", "Alternatives", "Structured"];
  const actualByBucket = new Map<AlignmentBucket, number>(buckets.map((b) => [b, 0]));
  for (const h of holdings) {
    const cat = productById.get(h.productId)?.category;
    const bucket = bucketOfCategory(cat);
    if (bucket !== "Unknown") {
      actualByBucket.set(bucket, (actualByBucket.get(bucket) ?? 0) + toUsd(h.value, h.currency));
    }
  }
  const allocation: AllocationRow[] = buckets.map((bucket) => {
    const actualPct = Math.round(((actualByBucket.get(bucket) ?? 0) / total) * 100);
    const targetPct = target[bucket];
    return {
      bucket,
      targetPct,
      actualPct,
      over: actualPct > targetPct + 5,
      under: actualPct < targetPct - 5
    };
  });

  // ---------- Liquidity buckets (donut) ----------
  let liquidValue = 0;
  let semiValue = 0;
  let illiquidValue = 0;
  for (const h of holdings) {
    const cat = productById.get(h.productId)?.category;
    const value = toUsd(h.value, h.currency);
    if (cat && LIQUID_CATEGORIES.has(cat)) liquidValue += value;
    else if (cat && SEMI_LIQUID_CATEGORIES.has(cat)) semiValue += value;
    else if (cat && ILLIQUID_BUCKET_CATEGORIES.has(cat)) illiquidValue += value;
  }
  const liquidPct = Math.round((liquidValue / total) * 100);
  const semiPct = Math.round((semiValue / total) * 100);
  const illiquidPct = Math.round((illiquidValue / total) * 100);

  // ---------- Headline state ----------
  let state: ComplianceState = "Pass";
  if (gap >= 3 || illiquidPct > 50) state = "Block";
  else if (gap >= 2 || illiquidPct > 35) state = "Watch";

  // ---------- Drift days (derive from priorityScore as a stable demo proxy) ----------
  const driftDays = Math.max(0, Math.round((customer.priorityScore - 60) / 2));

  // ---------- Factor breakdown ----------
  const factors: AlignmentFactor[] = [];
  // 1. Base relationship signal — 38 base from scoring formula.
  factors.push({
    name: "Base relationship signal",
    weight: 38,
    desc: `${customer.serviceTier} · ${customer.segment}. Baseline elevation for AUM tier and historical engagement.`
  });
  // 2. Risk Profile Mismatch — only when the portfolio runs hotter than profile.
  if (gap >= 1) {
    factors.push({
      name: "Risk Profile Mismatch",
      weight: Math.round(Math.min(40, gap * 12)),
      desc: `Live portfolio risk ${actualScore} runs above stated tolerance ${profileScore}. Drift exceeds +2.0 threshold for ${driftDays} days.`
    });
  }
  // 3. Concentration risk
  const concentration = getConcentrationRisk(holdings, products);
  if (concentration.state !== "Pass" && concentration.state !== "NotChecked") {
    factors.push({
      name: "Concentration risk",
      weight: concentration.state === "Block" ? 28 : 18,
      desc:
        concentration.topPosition && concentration.topCategory
          ? `${concentration.topCategory.category} sector ${concentration.topCategory.pct.toFixed(0)}% of book; cap 40%. Top position ${concentration.topPosition.name} at ${concentration.topPosition.pct.toFixed(0)}%.`
          : concentration.detail
    });
  }
  // 4. Engagement decay — derived from priorityScore tail.
  const decay = Math.min(20, Math.max(0, customer.priorityScore - 70));
  if (decay > 0) {
    factors.push({
      name: "Engagement decay",
      weight: decay,
      desc: `Last contact ${customer.lastContactedAt ? "delayed" : "never"}; review ${customer.nextReviewDate}. Pattern matches past-attrition signature.`
    });
  }
  // Pad to 4 factors so the grid always renders evenly.
  while (factors.length < 4) {
    factors.push({
      name: "Suitability window",
      weight: 8,
      desc: `Next review ${customer.nextReviewDate}. Suitability questionnaire valid through ${customer.suitabilityExpiresAt}.`
    });
    break;
  }

  return {
    profileScore,
    actualScore,
    gap,
    state,
    driftDays,
    allocation,
    liquidity: { liquidPct, semiPct, illiquidPct, illiquidCap: 35 },
    factors: factors.slice(0, 4)
  };
}
