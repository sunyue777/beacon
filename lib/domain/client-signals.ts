import type { CustomerProfile, Holding, LifecycleEvent, Product, Transaction } from "@/lib/repo/types";
import { toUsd } from "@/lib/utils/currency";

/**
 * Priority tier mapping. The numeric `priorityScore` in the data is a demo
 * formula (see docs/SCORING.md); RMs in the field don't think in numbers,
 * they think in tiers. Use this everywhere we render a priority badge.
 */
export type PriorityTier = "Critical" | "Active" | "Watch" | "Steady";

export function getPriorityTier(score: number): PriorityTier {
  if (score >= 85) return "Critical";
  if (score >= 70) return "Active";
  if (score >= 55) return "Watch";
  return "Steady";
}

/** Tailwind/state color hint for the tier badge. */
export function getPriorityTierTone(tier: PriorityTier): "danger" | "warning" | "primary" | "muted" {
  if (tier === "Critical") return "danger";
  if (tier === "Active") return "warning";
  if (tier === "Watch") return "primary";
  return "muted";
}

export function getPriorityReason(customer: CustomerProfile) {
  const tag = customer.tags[0];
  switch (tag) {
    case "DormantCash":
      return pickReason(customer, [
        "Dormant cash - review yield options",
        "Idle cash balance - prepare yield context",
        "Cash position unchanged - prepare liquidity check"
      ]);
    case "Maturity":
      return pickReason(customer, [
        "Holding maturing soon - prepare reinvestment options",
        "Maturity window open - gather renewal context",
        "Upcoming maturity - prepare liquidity and rollover notes"
      ]);
    case "RiskMismatch":
      return pickReason(customer, [
        "Risk profile and portfolio mismatch detected",
        "Portfolio risk drift - inspect alignment evidence",
        "Risk alignment check needed before client follow-up"
      ]);
    case "MarketMove":
      return pickReason(customer, [
        "Market move impact on portfolio",
        "Market movement surfaced in holdings",
        "Portfolio exposure moved with market conditions"
      ]);
    case "Lifecycle":
      return pickReason(customer, [
        "Lifecycle event flagged",
        "Relationship event ready for follow-up",
        "Client context changed - prepare touchpoint"
      ]);
    case "HighValue":
      return pickReason(customer, [
        "High value relationship - proactive touch",
        "Priority relationship - prepare coverage touch",
        "Key relationship - gather next conversation context"
      ]);
    case "ReviewDue":
      return pickReason(customer, [
        "Annual review due",
        "Review window open - prepare agenda",
        "Annual review approaching - gather evidence pack"
      ]);
    case "ServiceWindow":
      return pickReason(customer, [
        "Service window - prepare relationship touch",
        "Service cadence opened - prepare client context",
        "Coverage window open - prepare next touchpoint"
      ]);
    default:
      return `${customer.serviceTier} client - ${customer.riskProfile}`;
  }
}

function pickReason(customer: CustomerProfile, variants: string[]) {
  const suffix = Number(customer.customerId.slice(-4));
  const index = Number.isFinite(suffix) ? suffix % variants.length : customer.priorityScore % variants.length;
  return variants[index];
}

export function getLifecycleSignal(events: LifecycleEvent[]) {
  const sorted = [...events].sort((a, b) => {
    const importance = scoreImportance(b.importance) - scoreImportance(a.importance);
    return importance || b.date.localeCompare(a.date);
  });
  return sorted[0];
}

export function hasRiskMismatch(holdings: Holding[]) {
  return holdings.some((holding) => holding.riskStatus === "mismatch");
}

export function getProductAllocation(holdings: Holding[], products: Product[]) {
  const productById = new Map(products.map((product) => [product.productId, product]));
  const totals = new Map<string, number>();
  for (const holding of holdings) {
    const category = productById.get(holding.productId)?.category ?? "Other";
    totals.set(category, (totals.get(category) ?? 0) + toUsd(holding.value, holding.currency));
  }
  return [...totals.entries()]
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);
}

export function isHeroCustomer(transactions: Transaction[]) {
  return transactions.length >= 95;
}

/* ------------------------- Time / freshness helpers ------------------------- */

function daysBetween(later: Date, earlier: Date) {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

function referenceDate(asOf?: string) {
  const date = asOf?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  return new Date(`${date}T00:00:00.000Z`);
}

export function daysSince(iso: string | undefined, asOf?: string): number | undefined {
  if (!iso) return undefined;
  return daysBetween(referenceDate(asOf), new Date(iso));
}

export function daysUntil(iso: string | undefined, asOf?: string): number | undefined {
  if (!iso) return undefined;
  return daysBetween(new Date(iso), referenceDate(asOf));
}

/** Human-readable "Last contact 87d ago" / "today" / "yesterday". */
export function formatRelativeDays(iso?: string, asOf?: string): string {
  const days = daysSince(iso, asOf);
  if (days === undefined) return "Never contacted";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

/** Color tone for last-contact freshness badge. */
export function getContactFreshnessTone(iso?: string, asOf?: string): "danger" | "warning" | "muted" | "success" {
  const days = daysSince(iso, asOf);
  if (days === undefined) return "danger";
  if (days >= 120) return "danger";
  if (days >= 60) return "warning";
  if (days >= 21) return "muted";
  return "success";
}

export type ReviewStatus = {
  kind: "overdue" | "due-soon" | "on-track" | "future";
  days: number;
  label: string;
};

/** Categorize a nextReviewDate so the UI can render it consistently. */
export function getReviewStatus(iso: string, asOf?: string): ReviewStatus {
  const until = daysUntil(iso, asOf) ?? 0;
  if (until < 0) {
    return { kind: "overdue", days: -until, label: `Review overdue ${-until}d` };
  }
  if (until <= 14) {
    return { kind: "due-soon", days: until, label: `Review in ${until}d` };
  }
  if (until <= 60) {
    return { kind: "on-track", days: until, label: `Review in ${until}d` };
  }
  return { kind: "future", days: until, label: `Review in ${until}d` };
}

function scoreImportance(importance: LifecycleEvent["importance"]) {
  if (importance === "High") return 3;
  if (importance === "Medium") return 2;
  return 1;
}
