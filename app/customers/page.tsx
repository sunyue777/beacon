import Link from "next/link";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  PhoneCall,
  Search
} from "lucide-react";
import { getCurrentAccount } from "@/lib/auth/server-session";
import { getRoleLabel } from "@/lib/auth/accounts";
import {
  daysSince,
  formatRelativeDays,
  getContactFreshnessTone,
  getLifecycleSignal,
  getPriorityReason,
  getPriorityTier,
  getPriorityTierTone,
  getReviewStatus,
  hasRiskMismatch,
  type PriorityTier
} from "@/lib/domain/client-signals";
import { getRepo } from "@/lib/repo";
import { formatCurrency } from "@/lib/utils/format";
import type {
  CustomerProfile,
  Holding,
  LifecycleEvent,
  ListCustomersOptions,
  RMRole
} from "@/lib/repo/types";

type SearchParams = {
  role?: RMRole;
  q?: string;
  priority?: ListCustomersOptions["priority"];
  tier?: CustomerProfile["serviceTier"];
  lifecycle?: ListCustomersOptions["lifecycle"];
  risk?: ListCustomersOptions["risk"];
  sort?: ListCustomersOptions["sort"];
  page?: string;
};

type CopilotChannel = "email" | "whatsapp" | "call_script";

type PageProps = {
  searchParams?: Promise<SearchParams>;
};

const pageSize = 25;
const tiers: CustomerProfile["serviceTier"][] = ["Standard", "Premium", "VIP"];

export default async function CustomersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const account = await getCurrentAccount();
  const repo = getRepo();
  const canUseVisibilityPivot = account.role === "Manager";
  const role = canUseVisibilityPivot ? params?.role : undefined;
  const safeParams = { ...params, role };
  const currentPage = Math.max(1, Number(params?.page ?? "1") || 1);
  const offset = (currentPage - 1) * pageSize;
  const scopeOptions: ListCustomersOptions = role ? { role } : { ownedBy: account.rmId };

  const listOptions: ListCustomersOptions = {
    limit: pageSize,
    offset,
    query: params?.q,
    priority: params?.priority,
    serviceTier: params?.tier,
    lifecycle: params?.lifecycle,
    risk: params?.risk,
    sort: params?.sort,
    ...scopeOptions
  };

  const [customers, bookScope, rms, allEvents, allHoldings, market] = await Promise.all([
    repo.listCustomers(listOptions),
    repo.listCustomers(scopeOptions),
    repo.listRms(),
    repo.listLifecycleEvents(),
    repo.listHoldings(),
    repo.getLatestMarketSnapshot()
  ]);

  const referenceDate = market?.date;
  const totalPages = Math.max(1, Math.ceil(customers.total / pageSize));
  const lifecycleByCustomer = groupByCustomer(allEvents);
  const holdingsByCustomer = groupByCustomer(allHoldings);
  const scopeOwner = role ? `${getRoleLabel(role)} visibility` : `${account.name}'s direct book`;
  const activeSort = params?.sort ?? "priority";
  const startIndex = customers.items.length === 0 ? 0 : offset + 1;
  const endIndex = offset + customers.items.length;

  // Filter chip counts — derived in-memory from the same logic the repo
  // applies. Mirrors lib/repo/local-json-repo.ts listCustomers filter
  // branches. Using bookScope.items avoids extra queries.
  const filterCounts = countFilterChips(bookScope.items, allEvents, allHoldings, referenceDate);

  return (
    <main className="space-y-5">
      {/* Page header + pivots */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[36px] font-medium leading-[1.1] tracking-tight">Client Book</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-[1.5] text-muted-foreground">
            <strong className="text-foreground">{bookScope.total}</strong> customers in {scopeOwner}.{" "}
            {customers.total} match the current view. Names and lists outside your permission scope are hidden.
          </p>
        </div>
        {canUseVisibilityPivot ? (
          <div className="flex gap-1 rounded-full border border-border/60 bg-muted/60 p-1">
            <PivotPill
              active={!role}
              href={makeHref(safeParams, { role: undefined, page: undefined })}
              label={`My book · ${bookScope.total}`}
            />
            {(["Junior", "MidLevel"] as RMRole[]).map((candidate) => (
              <PivotPill
                key={candidate}
                active={candidate === role}
                href={makeHref(safeParams, { role: candidate, page: undefined })}
                label={getRoleLabel(candidate)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Full-width search */}
      <div>
        <form
          action="/customers"
          className="flex flex-col justify-between gap-3 rounded-[16px] border border-border bg-card p-4 shadow-soft"
          method="get"
        >
          {role ? <input name="role" type="hidden" value={role} /> : null}
          {params?.priority ? <input name="priority" type="hidden" value={params.priority} /> : null}
          {params?.tier ? <input name="tier" type="hidden" value={params.tier} /> : null}
          {params?.lifecycle ? <input name="lifecycle" type="hidden" value={params.lifecycle} /> : null}
          {params?.risk ? <input name="risk" type="hidden" value={params.risk} /> : null}
          {params?.sort ? <input name="sort" type="hidden" value={params.sort} /> : null}
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Search
          </div>
          <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-muted/50 px-3.5 py-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              className="flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
              defaultValue={params?.q ?? ""}
              name="q"
              placeholder="Search by name, profession, or city"
            />
          </div>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[12px] font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </button>
        </form>
      </div>

      {/* Filter card */}
      <div className="rounded-[16px] border border-border bg-card px-6 py-5 shadow-soft">
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.55fr]">
          <FilterGroup description="Internal service tier used for coverage and service model." label="Client tier">
            {tiers.map((tier) => (
              <FilterChip
                key={tier}
                active={params?.tier === tier}
                count={filterCounts.tier[tier]}
                href={makeHref(safeParams, { tier: params?.tier === tier ? undefined : tier, page: undefined })}
                label={tier}
                tone={tier}
                title={`${tier} clients by internal service tier.`}
              />
            ))}
          </FilterGroup>

          <FilterGroup description="Work queues derived from contact freshness, review gates, maturity, and portfolio drift." label="Service signals">
            <FilterChip
              active={params?.priority === "high"}
              count={filterCounts.priority.high}
              href={makeHref(safeParams, { priority: params?.priority === "high" ? undefined : "high", page: undefined })}
              title="High-priority clients based on service tier, review pressure, lifecycle, and portfolio signals."
              label="Priority"
            />
            <FilterChip
              active={params?.priority === "reviewDue"}
              count={filterCounts.priority.reviewDue}
              href={makeHref(safeParams, { priority: params?.priority === "reviewDue" ? undefined : "reviewDue", page: undefined })}
              title="Review gate is due or overdue."
              label="Review"
            />
            <FilterChip
              active={params?.priority === "rebalance"}
              count={filterCounts.priority.rebalance}
              href={makeHref(safeParams, { priority: params?.priority === "rebalance" ? undefined : "rebalance", page: undefined })}
              title="Portfolio drift or risk mismatch suggests a rebalance conversation."
              label="Rebalance"
            />
            <FilterChip
              active={params?.lifecycle === "High"}
              count={filterCounts.lifecycleHigh}
              href={makeHref(safeParams, { lifecycle: params?.lifecycle === "High" ? undefined : "High", page: undefined })}
              title="High-importance lifecycle signal."
              label="Lifecycle"
            />
            <FilterChip
              active={params?.priority === "dormant"}
              count={filterCounts.priority.dormant}
              href={makeHref(safeParams, { priority: params?.priority === "dormant" ? undefined : "dormant", page: undefined })}
              title="Dormant-client signal based on service inactivity, not AUM = 0."
              label="Dormant"
            />
            <FilterChip
              active={params?.priority === "noRecentContact"}
              count={filterCounts.priority.noRecentContact}
              href={makeHref(safeParams, { priority: params?.priority === "noRecentContact" ? undefined : "noRecentContact", page: undefined })}
              title="No recorded client contact for more than 120 days."
              label="No recent contact"
            />
            <FilterChip
              active={params?.priority === "maturitySoon"}
              count={filterCounts.priority.maturitySoon}
              href={makeHref(safeParams, { priority: params?.priority === "maturitySoon" ? undefined : "maturitySoon", page: undefined })}
              title="Maturity event or product maturity signal is coming soon."
              label="Maturity"
            />
            <FilterChip
              active={params?.priority === "recentlyContacted"}
              count={filterCounts.priority.recentlyContacted}
              href={makeHref(safeParams, { priority: params?.priority === "recentlyContacted" ? undefined : "recentlyContacted", page: undefined })}
              title="Recently contacted clients, useful for follow-up tracking."
              label="Recent"
            />
          </FilterGroup>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <span className="mr-2 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <ArrowDownUp className="h-3 w-3" />
            Sort
          </span>
          <SortChip
            active={activeSort === "priority"}
            href={makeHref(safeParams, { sort: undefined, page: undefined })}
            label="Priority · desc"
          />
          <SortChip
            active={activeSort === "nextReview"}
            href={makeHref(safeParams, { sort: "nextReview", page: undefined })}
            label="Next review"
          />
          <SortChip
            active={activeSort === "aumDesc" || activeSort === "aumAsc"}
            href={makeHref(safeParams, { sort: activeSort === "aumDesc" ? "aumAsc" : "aumDesc", page: undefined })}
            icon={activeSort === "aumAsc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            label="AUM"
          />
          <SortChip
            active={activeSort === "name"}
            href={makeHref(safeParams, { sort: "name", page: undefined })}
            label="Name"
          />
        </div>
      </div>

      {/* Results meta */}
      <div className="flex items-center justify-between px-1 text-[12px] text-muted-foreground">
        <span>
          <strong className="text-foreground">{customers.total} clients</strong> matched · sorted by{" "}
          {activeSort === "nextReview" ? "next review" : activeSort === "aumDesc" || activeSort === "aumAsc" ? "AUM" : "priority"}
        </span>
        <span>
          Showing {startIndex}–{endIndex} of {customers.total}
        </span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-2">
        {customers.items.map((customer) => {
          const rm = rms.find((item) => item.rmId === customer.rmId);
          const events = lifecycleByCustomer.get(customer.customerId) ?? [];
          const signal = getLifecycleSignal(events);
          const tier = getPriorityTier(customer.priorityScore);
          const review = getReviewStatus(customer.nextReviewDate, referenceDate);
          const contactTone = getContactFreshnessTone(customer.lastContactedAt, referenceDate);
          const isVip = customer.serviceTier === "VIP";
          const priorityReason = getPriorityReason(customer);
          const signalRepeatsReview = Boolean(signal?.title.toLowerCase().includes("annual review"));
          const copilotContext = `${customer.name}: ${priorityReason}. Last contact ${formatRelativeDays(customer.lastContactedAt, referenceDate)}. ${review.label}.`;
          return (
            <div
              key={customer.customerId}
              className="group grid grid-cols-1 items-center gap-5 rounded-[14px] border border-border bg-card p-5 transition hover:border-primary/35 hover:bg-primary-soft/30 md:grid-cols-[1.2fr_1.3fr_minmax(220px,0.95fr)_86px]"
            >
              {/* Identity */}
              <Link className="flex min-w-0 items-center gap-3.5" href={`/customers/${customer.customerId}`}>
                <div
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border text-[14px] font-semibold ${
                    isVip
                      ? "border-accent/40 bg-accent/18 text-accent-foreground"
                      : "border-primary/20 bg-primary/8 text-primary"
                  }`}
                >
                  {customer.avatarInitials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-semibold">{customer.name}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <TierBadge tier={tier} />
                    <ServiceTierBadge tier={customer.serviceTier} />
                    <span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {customer.segment}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[12px] text-muted-foreground">
                    {customer.profession} · {customer.location.city}
                  </div>
                </div>
              </Link>

              {/* Priority reason */}
              <Link href={`/customers/${customer.customerId}`} className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                  Priority reason
                </div>
                <div className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-[1.45]">
                  <span className="ai-generated-mark mt-0.5 text-[12px] leading-none" aria-hidden />
                  <PriorityReasonText reason={priorityReason} />
                </div>
                <div className="mt-1.5 font-mono text-[11px] text-muted-foreground tabular">
                  {formatCurrency(customer.totalAum, customer.currency)} · score {customer.priorityScore}
                  {rm ? ` · ${rm.name}` : ""}
                </div>
              </Link>

              {/* Engagement */}
              <Link href={`/customers/${customer.customerId}`} className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                  Engagement
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <EngBadge tone={contactTone}>
                    Last contact {formatRelativeDays(customer.lastContactedAt, referenceDate)}
                  </EngBadge>
                  <EngBadge tone={reviewTone(review.kind)}>
                    <span className={review.kind === "overdue" || review.kind === "due-soon" ? "ai-signal-text font-semibold" : ""}>
                      {review.label}
                    </span>
                  </EngBadge>
                </div>
                {signal && !signalRepeatsReview ? (
                  <div
                    className="ai-signal-text mt-1.5 line-clamp-1 text-[11px] font-semibold"
                  >
                    {signal.title} ({signal.importance})
                  </div>
                ) : null}
              </Link>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1.5 md:flex-col md:items-stretch md:justify-self-end">
                <RowAction
                  href={makeCopilotHref(safeParams, {
                    channel: "call_script",
                    customerId: customer.customerId,
                    intent: `Prepare a short call opener for ${copilotContext} Use evidence-led language and leave approval decisions to the RM.`
                  })}
                  icon={<PhoneCall className="h-3 w-3" />}
                  label="Call prep"
                  tone="call"
                />
                <RowAction
                  href={makeCopilotHref(safeParams, {
                    channel: "email",
                    customerId: customer.customerId,
                    intent: `Prepare a concise email draft for ${copilotContext} Keep it client-ready but in prepared state for RM approval.`
                  })}
                  icon={<Mail className="h-3 w-3" />}
                  label="Email"
                  tone="email"
                />
                <RowAction
                  href={makeCopilotHref(safeParams, {
                    channel: "whatsapp",
                    customerId: customer.customerId,
                    intent: `Prepare a short WhatsApp check-in for ${copilotContext} Keep it warm, factual, and client-friendly.`
                  })}
                  icon={<MessageSquare className="h-3 w-3" />}
                  label="WhatsApp"
                  tone="whatsapp"
                />
              </div>
            </div>
          );
        })}
        {customers.items.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-border bg-card px-5 py-10 text-center text-[13px] text-muted-foreground">
            No clients match the current filters.
          </div>
        ) : null}
      </div>

      {/* Pagination — numeric page buttons + prev/next */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="text-[12px] text-muted-foreground">
          Page <strong className="text-foreground tabular">{currentPage}</strong> of{" "}
          <strong className="text-foreground tabular">{totalPages}</strong> ·{" "}
          <strong className="text-foreground tabular">{customers.total}</strong> results
        </div>
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          <PageNavLink
            disabled={currentPage <= 1}
            href={makeHref(safeParams, { page: String(Math.max(1, currentPage - 1)) })}
            label={<ChevronLeft className="h-3.5 w-3.5" />}
            title="Previous page"
          />
          {buildPageRange(currentPage, totalPages).map((entry, index) =>
            entry === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="px-1 text-[12px] text-muted-foreground"
                aria-hidden
              >
                …
              </span>
            ) : (
              <PageNavLink
                key={entry}
                active={entry === currentPage}
                href={makeHref(safeParams, { page: String(entry) })}
                label={entry}
                title={`Page ${entry}`}
              />
            )
          )}
          <PageNavLink
            disabled={currentPage >= totalPages}
            href={makeHref(safeParams, { page: String(Math.min(totalPages, currentPage + 1)) })}
            label={<ChevronRight className="h-3.5 w-3.5" />}
            title="Next page"
          />
        </nav>
      </div>
    </main>
  );
}

/** Page-link cell used by the numeric paginator. Renders as a 32×32 chip with
 * primary fill when active, neutral otherwise, disabled when at edges. */
function PageNavLink({
  active,
  disabled,
  href,
  label,
  title
}: {
  active?: boolean;
  disabled?: boolean;
  href: string;
  label: React.ReactNode;
  title: string;
}) {
  const cls = active
    ? "bg-primary text-primary-foreground border-primary"
    : disabled
      ? "pointer-events-none border-border bg-card text-muted-foreground/50"
      : "border-border bg-card text-foreground hover:border-primary hover:text-primary";
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled}
      className={`inline-flex h-8 min-w-[32px] items-center justify-center rounded-[8px] border px-2 font-mono text-[12px] tabular transition ${cls}`}
      href={href}
      title={title}
    >
      {label}
    </Link>
  );
}

/** Build a compact page list with ellipses. Always shows first, last, current
 * ±1, plus edges. e.g. for currentPage=7, totalPages=24 → [1, …, 6, 7, 8, …, 24]. */
function buildPageRange(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, total, current - 1, current, current + 1]);
  // Add a near-edge buffer so 1, 2 and last-1, last show by default
  if (current <= 4) [2, 3, 4, 5].forEach((n) => set.add(n));
  if (current >= total - 3) [total - 4, total - 3, total - 2, total - 1].forEach((n) => set.add(n));
  const sorted = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    out.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) out.push("ellipsis");
  }
  return out;
}

/* ============================ small primitives ============================ */

function PivotPill({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition ${
        active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:bg-card hover:text-foreground"
      }`}
      href={href}
    >
      {label}
    </Link>
  );
}

function FilterGroup({ children, description, label }: { children: React.ReactNode; description?: string; label: string }) {
  return (
    <div>
      <div className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      {description ? <p className="-mt-1 mb-2.5 text-[11px] leading-4 text-muted-foreground/80">{description}</p> : null}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  count,
  href,
  label,
  title,
  tone
}: {
  active: boolean;
  count?: number;
  href: string;
  label: string;
  title?: string;
  tone?: CustomerProfile["serviceTier"];
}) {
  const tierStyle = tone ? serviceTierStyle(tone, active) : undefined;
  return (
    <Link
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
        tone
          ? ""
          : active
            ? "border-[hsl(var(--ai-border))] bg-ai-surface text-ai-accent shadow-[0_0_0_3px_hsl(var(--ai-glow)/0.08)]"
            : "border-border bg-card text-muted-foreground hover:border-[hsl(var(--ai-border)/0.65)] hover:bg-ai-surface/45 hover:text-ai-accent"
      }`}
      href={href}
      style={tierStyle}
      title={title}
    >
      {label}
      {count !== undefined ? (
        <span
          className="font-mono text-[10px] tabular opacity-70"
          aria-label={`${count} clients`}
        >
          · {count}
        </span>
      ) : null}
    </Link>
  );
}

function ServiceTierBadge({ tier }: { tier: CustomerProfile["serviceTier"] }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={serviceTierStyle(tier, true)}
    >
      {tier}
    </span>
  );
}

/**
 * Tier palette — narrowed in v0.8 polish. Standard + Premium are now neutral
 * (Premium gets a slightly stronger fill, no colored bg) so the eye reserves
 * actual tonal weight for VIP (gold) and Private (navy). The fewer color
 * voices on the row card, the more the AI surfaces stand out.
 */
function serviceTierStyle(tier: CustomerProfile["serviceTier"], active: boolean): React.CSSProperties {
  const palette: Record<CustomerProfile["serviceTier"], { bg: string; fg: string; border: string }> = {
    Standard: {
      bg: active ? "hsl(var(--muted))" : "hsl(var(--muted) / 0.55)",
      fg: "hsl(var(--muted-foreground))",
      border: "hsl(var(--border-strong))"
    },
    Premium: {
      bg: active ? "hsl(var(--card-soft))" : "hsl(var(--muted) / 0.55)",
      fg: "hsl(var(--foreground))",
      border: "hsl(var(--border-strong))"
    },
    VIP: {
      bg: active ? "hsl(var(--brand-gold) / 0.30)" : "hsl(var(--brand-gold) / 0.12)",
      fg: "hsl(var(--foreground))",
      border: "hsl(var(--brand-gold) / 0.46)"
    },
    Private: {
      bg: active ? "hsl(var(--brand-navy))" : "hsl(var(--brand-navy) / 0.10)",
      fg: active ? "hsl(var(--brand-offwhite))" : "hsl(var(--brand-navy))",
      border: "hsl(var(--brand-navy) / 0.46)"
    }
  };
  return {
    backgroundColor: palette[tier].bg,
    borderColor: palette[tier].border,
    color: palette[tier].fg
  };
}

function SortChip({
  active,
  href,
  label,
  icon
}: {
  active: boolean;
  href: string;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${
        active
          ? "border-primary/40 bg-primary-soft text-primary"
          : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
      }`}
      href={href}
    >
      {icon}
      {label}
    </Link>
  );
}

function TierBadge({ tier }: { tier: PriorityTier }) {
  const tone = getPriorityTierTone(tier);
  const cls =
    tone === "danger"
      ? "bg-danger/10 text-danger border-danger/30"
      : tone === "warning"
        ? "bg-warning/14 text-warning border-warning/30"
        : tone === "primary"
          ? "bg-primary-soft text-primary border-primary/30"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {tier}
    </span>
  );
}

function PriorityReasonText({ reason }: { reason: string }) {
  const strongSignals = [
    "Annual review due",
    "Holding maturing soon",
    "Risk profile and portfolio mismatch",
    "Market move",
    "Lifecycle event",
    "Dormant cash",
    "High value relationship"
  ];
  const signal = strongSignals.find((item) => reason.toLowerCase().startsWith(item.toLowerCase()));
  if (!signal) {
    return <span className="line-clamp-2">{reason}</span>;
  }
  return (
    <span className="line-clamp-2">
      <strong className="ai-signal-text font-semibold">{signal}</strong>
      {reason.slice(signal.length)}
    </span>
  );
}

function EngBadge({
  tone,
  children
}: {
  tone: "danger" | "warning" | "muted" | "success";
  children: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "bg-danger/10 text-danger border-danger/30"
      : tone === "warning"
        ? "bg-warning/12 text-warning border-warning/30"
        : tone === "success"
          ? "bg-success/12 text-success border-success/30"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function reviewTone(kind: "overdue" | "due-soon" | "on-track" | "future"): "danger" | "warning" | "success" | "muted" {
  if (kind === "overdue") return "danger";
  if (kind === "due-soon") return "warning";
  if (kind === "on-track") return "success";
  return "muted";
}

function RowAction({
  href,
  icon,
  label,
  tone = "neutral"
}: {
  href: string;
  icon?: React.ReactNode;
  label: string;
  tone?: "call" | "email" | "whatsapp" | "neutral";
}) {
  const toneClass =
    tone === "call"
      ? "border-[hsl(var(--ai-border)/0.55)] bg-[hsl(var(--ai-surface)/0.72)] text-[hsl(var(--ai-accent))] hover:border-[hsl(var(--ai-accent)/0.55)]"
      : tone === "email"
        ? "border-[hsl(var(--ai-border)/0.48)] bg-[hsl(var(--ai-surface-2)/0.62)] text-[hsl(var(--ai-foreground))] hover:border-[hsl(var(--ai-accent)/0.45)]"
        : tone === "whatsapp"
          ? "border-[hsl(var(--brand-gold)/0.5)] bg-[hsl(var(--brand-gold)/0.16)] text-[hsl(var(--ai-foreground))] hover:border-[hsl(var(--ai-accent)/0.45)]"
          : "border-[hsl(var(--ai-border)/0.45)] bg-card text-[hsl(var(--ai-foreground))] hover:border-[hsl(var(--ai-accent)/0.45)]";
  return (
    <Link
      href={href}
      scroll={false}
      className={`inline-flex min-w-[88px] items-center justify-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[11px] font-medium transition ${toneClass}`}
    >
      {icon ?? null}
      {label}
    </Link>
  );
}

function makeHref(
  params: SearchParams | undefined,
  overrides: Partial<Record<keyof SearchParams, string | undefined>>
) {
  const next = new URLSearchParams();
  const entries: [keyof SearchParams, string | undefined][] = [
    ["role", params?.role],
    ["q", params?.q],
    ["priority", params?.priority],
    ["tier", params?.tier],
    ["lifecycle", params?.lifecycle],
    ["risk", params?.risk],
    ["sort", params?.sort],
    ["page", params?.page]
  ];
  for (const [key, value] of entries) {
    const override = overrides[key];
    const finalValue = Object.prototype.hasOwnProperty.call(overrides, key) ? override : value;
    if (finalValue) next.set(key, finalValue);
  }
  const query = next.toString();
  return query ? `/customers?${query}` : "/customers";
}

function makeCopilotHref(
  params: SearchParams | undefined,
  options: {
    channel: CopilotChannel;
    customerId: string;
    intent: string;
  }
) {
  const base = makeHref(params, {});
  const [path, query = ""] = base.split("?");
  const next = new URLSearchParams(query);
  next.set("copilot", "draft_assist");
  next.set("copilotCustomerId", options.customerId);
  next.set("copilotChannel", options.channel);
  next.set("copilotIntent", options.intent);
  return `${path}?${next.toString()}`;
}

/**
 * Compute filter chip counts in-memory. Mirrors the filter branches in
 * `lib/repo/local-json-repo.ts → listCustomers` so chip counts always match
 * what the row list will show. Costs ~1 pass per filter on the bookScope
 * set (≤595 customers); O(n) and runs server-side, no extra repo round
 * trips.
 */
function countFilterChips(
  items: CustomerProfile[],
  events: LifecycleEvent[],
  holdings: Holding[],
  referenceDate?: string
) {
  const mismatchCustomerIds = new Set(
    holdings.filter((h) => h.riskStatus === "mismatch").map((h) => h.customerId)
  );
  const maturityEventCustomerIds = new Set(
    events.filter((e) => e.type === "Maturity").map((e) => e.customerId)
  );
  const highLifecycleCustomerIds = new Set(
    events.filter((e) => e.importance === "High").map((e) => e.customerId)
  );

  const tier: Record<CustomerProfile["serviceTier"], number> = {
    Standard: 0,
    Premium: 0,
    VIP: 0,
    Private: 0
  };
  let lifecycleHigh = 0;
  let high = 0;
  let reviewDue = 0;
  let rebalance = 0;
  let dormant = 0;
  let noRecentContact = 0;
  let maturitySoon = 0;
  let recentlyContacted = 0;

  for (const c of items) {
    tier[c.serviceTier] = (tier[c.serviceTier] ?? 0) + 1;
    if (highLifecycleCustomerIds.has(c.customerId)) lifecycleHigh += 1;
    if (c.priorityScore >= 76) high += 1;
    if (c.tags.includes("ReviewDue")) reviewDue += 1;
    if (c.tags.includes("RiskMismatch") || mismatchCustomerIds.has(c.customerId)) rebalance += 1;
    if (c.hasDormantClientSignal) dormant += 1;
    const since = daysSince(c.lastContactedAt, referenceDate);
    if (!c.lastContactedAt || (since !== undefined && since >= 120)) noRecentContact += 1;
    if (c.tags.includes("Maturity") || maturityEventCustomerIds.has(c.customerId)) maturitySoon += 1;
    if (c.lastContactedAt && since !== undefined && since <= 21) recentlyContacted += 1;
  }

  return {
    tier,
    lifecycleHigh,
    priority: {
      high,
      reviewDue,
      rebalance,
      dormant,
      noRecentContact,
      maturitySoon,
      recentlyContacted
    }
  };
}

function groupByCustomer<T extends { customerId: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    grouped.set(item.customerId, [...(grouped.get(item.customerId) ?? []), item]);
  }
  return grouped;
}
