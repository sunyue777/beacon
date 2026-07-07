import type { Account, CustomerProfile, Holding, LifecycleEvent, Product, Transaction } from "@/lib/repo/types";
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

export function formatMaskedAccountId(account: Pick<Account, "accountId" | "type">) {
  return `${formatAccountType(account.type)} ····${stableFourDigitHash(account.accountId)}`;
}

export type LifecycleEventDisplay = {
  title: string;
  description: string;
  timing: "past" | "today" | "future";
};

export function getLifecycleEventDisplay(event: LifecycleEvent, asOf?: string): LifecycleEventDisplay {
  const timing = getLifecycleTiming(event.date, asOf);
  const date = formatLifecycleDate(event.date);
  const timingCopy = timing === "past" ? pastLifecycleCopy(event.type, date) : timing === "today" ? todayLifecycleCopy(event.type, date) : futureLifecycleCopy(event.type, date);
  return {
    title: event.title,
    description: timingCopy ?? event.description,
    timing
  };
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

function formatAccountType(type: Account["type"]) {
  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function stableFourDigitHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return String(hash % 10000).padStart(4, "0");
}

function getLifecycleTiming(iso: string, asOf?: string): LifecycleEventDisplay["timing"] {
  const days = daysUntil(iso, asOf) ?? 0;
  if (days < 0) return "past";
  if (days === 0) return "today";
  return "future";
}

function formatLifecycleDate(iso: string) {
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function pastLifecycleCopy(type: LifecycleEvent["type"], date: string) {
  switch (type) {
    case "Review":
      return `Review was due on ${date} - prepare agenda, holdings context, and approval evidence.`;
    case "Maturity":
      return `Matured on ${date} - prepare reinvestment follow-up and liquidity notes.`;
    case "LifeEvent":
      return `Life event was recorded on ${date} - prepare a focused follow-up before the next client touch.`;
    case "Market":
      return `Market movement was recorded on ${date} - prepare a concise impact summary.`;
    case "Portfolio":
      return `Portfolio drift was visible on ${date} - prepare the holdings evidence before review.`;
  }
}

function todayLifecycleCopy(type: LifecycleEvent["type"], date: string) {
  switch (type) {
    case "Review":
      return `Review is due today, ${date} - prepare agenda, holdings context, and approval evidence.`;
    case "Maturity":
      return `Matures today, ${date} - prepare reinvestment follow-up and liquidity notes.`;
    case "LifeEvent":
      return `Life event is scheduled for today, ${date} - prepare a focused client check-in.`;
    case "Market":
      return `Market movement is active today, ${date} - prepare a concise impact summary.`;
    case "Portfolio":
      return `Portfolio drift is visible today, ${date} - prepare the holdings evidence before review.`;
  }
}

function futureLifecycleCopy(type: LifecycleEvent["type"], date: string) {
  switch (type) {
    case "Review":
      return `Review upcoming on ${date} - prepare agenda, holdings context, and approval evidence.`;
    case "Maturity":
      return `Maturity approaching on ${date} - prepare reinvestment context and liquidity notes.`;
    case "LifeEvent":
      return `Life event upcoming on ${date} - prepare a focused check-in before the next client touch.`;
    case "Market":
      return `Market movement may affect the portfolio on ${date} - prepare a concise impact summary.`;
    case "Portfolio":
      return `Portfolio drift review upcoming on ${date} - prepare the holdings evidence before review.`;
  }
}
