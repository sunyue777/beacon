import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleAlert,
  Clock,
  FileEdit,
  Send,
  ShieldCheck
} from "lucide-react";
import { ApprovalTransitionControls } from "@/components/copilot/approval-transition-controls";
import { MarketTonePanel } from "@/components/market/market-tone-panel";
import { getCurrentAccount } from "@/lib/auth/server-session";
import { getRoleLabel } from "@/lib/auth/accounts";
import { getDraftReviewSummary } from "@/lib/copilot/draft-summary";
import {
  formatRelativeDays,
  getPriorityReason,
  getPriorityTier,
  getPriorityTierTone,
  getReviewStatus,
  type PriorityTier
} from "@/lib/domain/client-signals";
import {
  getApprovalQueueForAccount,
  getComplianceHygiene,
  getReturnedDraftsForAccount,
  getRmCoverage
} from "@/lib/domain/governance";
import { getRepo } from "@/lib/repo";
import type {
  AuditEvent,
  AgentRun,
  CustomerProfile,
  RMRole,
  RMUser
} from "@/lib/repo/types";

type WorkspaceProps = {
  searchParams?: Promise<{ queue?: "full" }>;
};

const QUEUE_DEFAULT = 7;
const QUEUE_FULL = 20;

type BriefHeadlineModel = {
  lead: string;
  n1: string;
  mid: string;
  n2: string;
  tail: string;
  n3?: string;
  end?: string;
};

export default async function WorkspacePage({ searchParams }: WorkspaceProps) {
  const params = await searchParams;
  const expanded = params?.queue === "full";
  const queueLimit = expanded ? QUEUE_FULL : QUEUE_DEFAULT;

  const account = await getCurrentAccount();
  const repo = getRepo();

  const [ownedQueue, ownedBook, market, runs, auditEvents, rms, allCustomers] = await Promise.all([
    repo.listCustomers({ ownedBy: account.rmId, limit: queueLimit }),
    repo.listCustomers({ ownedBy: account.rmId }),
    repo.getLatestMarketSnapshot(),
    repo.listAgentRuns(),
    repo.listAuditEvents(),
    repo.listRms(),
    account.role === "Manager"
      ? repo.listCustomers({ role: "Manager" })
      : Promise.resolve(null)
  ]);

  const approvalQueue = getApprovalQueueForAccount(auditEvents, account);
  const returnedDrafts = getReturnedDraftsForAccount(auditEvents, runs, account);
  const briefRunDate = market?.date ?? new Date().toISOString().slice(0, 10);
  const visibleDraftEvents = auditEvents.filter((event) =>
    event.type.startsWith("draft.") &&
    (account.role === "Manager" ? event.actorId !== account.rmId : event.actorId === account.rmId)
  );

  if (account.role === "Manager" && allCustomers) {
    const coverage = getRmCoverage(rms, allCustomers.items, runs, auditEvents);
    const hygiene = getComplianceHygiene(allCustomers.items, auditEvents);
    return (
      <main className="space-y-6">
        <RoleIdentityStrip account={account} variant="manager" />
        <ManagerDailyBrief
          account={{ name: account.name, total: ownedQueue.total, teamSize: rms.length, allTotal: allCustomers.total }}
          approvalCount={approvalQueue.length}
          briefRunId={buildBriefRunId("mgr", briefRunDate)}
          hygiene={hygiene}
          coverage={coverage}
        />
        <TeamCoverageStrip coverage={coverage} runCount={runs.length} />

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <ApprovalQueueCard queue={approvalQueue} customers={allCustomers.items} rms={rms} runs={runs} />
          <aside className="flex flex-col gap-4">
            <ComplianceHygieneCard hygiene={hygiene} />
          </aside>
        </section>
      </main>
    );
  }

  const accountRuns = runs.filter((run) => run.rmId === account.rmId);
  const briefsReady = accountRuns.filter(
    (run) => run.channel === "talking_points" || run.channel === "analysis"
  ).length;
  const draftsSent = visibleDraftEvents.filter((event) => event.type === "draft.sent").length;
  const dailyPrepared = countDailyPrepared(ownedBook.items, account.role);
  const highlightedRelationships = ownedBook.items.filter((c) =>
    account.role === "Junior"
      ? c.serviceTier === "Standard" || c.serviceTier === "Premium"
      : c.serviceTier === "VIP" || c.serviceTier === "Private"
  ).length;
  const briefHeadline = buildRMBriefHeadline({
    prepared: dailyPrepared,
    premiumCount: highlightedRelationships,
    pendingApprovals: approvalQueue.length,
    role: account.role
  });

  return (
    <main className="space-y-6">
      {/* Top-left page title: role identity already lives in the header
          account chip; no role pill duplication here. */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-medium leading-tight tracking-tight md:text-[32px]">
            Today's Workspace
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Prioritize client work, review prepared evidence, move today's service actions forward.
          </p>
        </div>
      </header>

      <FusedWorkspaceHero
        account={account}
        briefRunId={buildBriefRunId("rm", briefRunDate)}
        headline={briefHeadline}
        ownedTotal={ownedQueue.total}
        variant="rm"
      />

      {returnedDrafts.length > 0 ? (
        <ReturnedDraftNotice customers={ownedBook.items} returnedDrafts={returnedDrafts} runs={runs} />
      ) : null}

      <WorkspaceQuickStatus
        briefsReady={briefsReady}
        drafts={approvalQueue.length + returnedDrafts.length}
        pendingApprovals={approvalQueue.length}
        queue={ownedQueue.items}
        returnedDrafts={returnedDrafts}
        sent={draftsSent}
      />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <WorkspaceStatus
          briefsReady={briefsReady}
          drafts={approvalQueue.length}
          expanded={expanded}
          pendingApprovals={approvalQueue.length}
          queue={ownedQueue.items}
          sent={draftsSent}
          total={ownedQueue.total}
        />
        <aside className="flex flex-col gap-4">
          <MarketTonePanel fallback={market} />
        </aside>
      </section>
    </main>
  );
}

function ReturnedDraftNotice({
  customers,
  returnedDrafts,
  runs
}: {
  customers: CustomerProfile[];
  returnedDrafts: AuditEvent[];
  runs: AgentRun[];
}) {
  const customerById = new Map(customers.map((customer) => [customer.customerId, customer]));
  const runById = new Map(runs.map((run) => [run.runId, run]));
  const first = returnedDrafts[0];
  const customer = first.customerId ? customerById.get(first.customerId) : undefined;
  const draft = getDraftReviewSummary(first.runId ? runById.get(first.runId) : undefined, first);
  return (
    <section
      className="rounded-[16px] border px-5 py-4 shadow-soft"
      style={{
        background: "linear-gradient(135deg, hsl(var(--warning) / 0.08), hsl(var(--brand-gold) / 0.12), hsl(var(--card)))",
        borderColor: "hsl(var(--warning) / 0.35)"
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-semibold text-[hsl(var(--warning))]">Returned for edit</div>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            A previous draft for <span className="font-medium text-foreground">{customer?.name ?? "this customer"}</span>{" "}
            was returned by Manager review. Open it to see the submitted content, delete it, or revise and submit again.
          </p>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {draft.channelLabel} / {draft.title} / {first.timestamp.slice(11, 16)}
          </div>
        </div>
        <Link
          className="inline-flex items-center rounded-[10px] bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
          href={returnedDraftHref(first)}
        >
          Open returned draft
        </Link>
      </div>
    </section>
  );
}

/* =============================== Fused workspace hero =============================== */

/** AI Daily Brief: the role identity + page title + action row that used
 * to live above this card moved to a top-of-page header in v0.9 (avoids
 * duplicating role identity that's already shown in the top-right account
 * chip). The hero is now a single AI-surface card with a soft role-accent
 * left border. */
function FusedWorkspaceHero({
  account,
  briefRunId,
  headline,
  ownedTotal,
  variant
}: {
  account: { name: string; role: RMRole; accent: string; title: string; rmId: string };
  briefRunId: string;
  headline: BriefHeadlineModel;
  ownedTotal: number;
  variant: "rm";
}) {
  void variant;
  return (
    <section
      className="overflow-hidden rounded-[16px] border shadow-soft"
      style={{ borderLeft: `4px solid hsl(var(--${account.accent}))` }}
    >
      <div
        className="relative overflow-hidden px-5 py-4"
        style={{
          background:
            "linear-gradient(180deg, hsl(var(--ai-surface)) 0%, hsl(var(--ai-surface-2)) 100%)"
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 0% 0%, hsl(var(--ai-glow) / 0.16) 0%, transparent 50%), radial-gradient(60% 70% at 100% 100%, hsl(var(--ai-accent) / 0.12) 0%, transparent 60%)"
          }}
        />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3.5">
            <span
              className="ai-generated-mark rounded-full border bg-card/70 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider"
              style={{ borderColor: "hsl(var(--ai-border) / 0.45)" }}
            >
              AI Daily Brief
            </span>
            <span className="font-mono text-[11px] text-ai-foreground/70">
              prepared 08:30 SGT / scope / {slug(account.name)} / direct book {ownedTotal} / run #{briefRunId}
            </span>
          </div>
          <div className="mt-3 w-full">
            <BriefHeadline {...headline} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* =============================== AI Daily Brief (RM) =============================== */

function RMDailyBrief({
  account,
  briefRunId,
  headline,
  bullets
}: {
  account: { name: string; total: number };
  briefRunId: string;
  headline: BriefHeadlineModel;
  bullets: CustomerProfile[];
}) {
  return (
    <AIBriefShell tag="AI Daily Brief" meta={`scope | ${slug(account.name)} | direct book: ${account.total} clients | run #${briefRunId}`}>
      <div className="grid gap-9 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <BriefHeadline {...headline} />
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {bullets[0] ? (
              <Link
                className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2.5 text-[13px] font-semibold text-card transition hover:-translate-y-px"
                href={`/customers/${bullets[0].customerId}`}
                style={{
                  background: "hsl(var(--ai-foreground))",
                  boxShadow: "0 8px 18px -8px hsl(var(--ai-foreground) / 0.4)"
                }}
              >
                Review highest priority - {bullets[0].name}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
        <BriefBullets>
          {bullets.map((customer, index) => (
            <BriefBulletRow
              index={index + 1}
              key={customer.customerId}
              title={`${customer.name} - ${getPriorityReason(customer).toLowerCase()}`}
              meta={`${customer.serviceTier} / ${customer.segment} / last contact ${formatRelativeDays(customer.lastContactedAt)}`}
              chip={customer.serviceTier}
            />
          ))}
        </BriefBullets>
      </div>
    </AIBriefShell>
  );
}

function buildRMBriefHeadline({
  prepared,
  premiumCount,
  pendingApprovals,
  role
}: {
  prepared: number;
  premiumCount: number;
  pendingApprovals: number;
  role: RMRole;
}) {
  const pendingLabel =
    role === "Junior"
      ? pendingApprovals === 1
        ? " manager-review draft is still open."
        : " manager-review drafts are still open."
      : pendingApprovals === 1
        ? " draft is awaiting your approval."
        : " drafts are awaiting your approval.";
  const relationshipLabel = role === "Junior" ? "Standard/Premium" : "VIP/Private";
  return {
    lead: "Beacon prepared ",
    n1: String(prepared),
    mid: " client touchpoints for today's service window. ",
    n2: String(Math.min(prepared, premiumCount)),
    tail: ` involve ${relationshipLabel} relationships, and `,
    n3: String(pendingApprovals),
    end: pendingLabel
  };
}

function countDailyPrepared(customers: CustomerProfile[], role: RMRole) {
  const candidates = customers.filter((customer) => {
    const tier = getPriorityTier(customer.priorityScore);
    const review = getReviewStatus(customer.nextReviewDate);
    return tier === "Critical" || tier === "Active" || review.kind === "overdue" || review.kind === "due-soon";
  });
  const max = role === "Junior" ? 4 : role === "MidLevel" ? 6 : 5;
  return Math.min(max, Math.max(1, candidates.length));
}

/* =============================== AI Daily Brief (Manager) =============================== */

function ManagerDailyBrief({
  account,
  approvalCount,
  briefRunId,
  hygiene,
  coverage
}: {
  account: { name: string; total: number; teamSize: number; allTotal: number };
  approvalCount: number;
  briefRunId: string;
  hygiene: ReturnType<typeof getComplianceHygiene>;
  coverage: ReturnType<typeof getRmCoverage>;
}) {
  const vipApprovals = Math.min(approvalCount, 2);
  const largestBook = [...coverage].sort((a, b) => b.customerCount - a.customerCount)[0];
  const headline = {
    lead: "",
    n1: String(approvalCount),
    mid: " drafts await your approval, ",
    n2: String(vipApprovals),
    tail: " are VIP/Private. Suitability action queue crossed ",
    n3: String(hygiene.suitabilityExpiring),
    end: ` overnight - ${largestBook?.rm.name.split(" ")[0] ?? "the team"} carries the largest book.`
  };
  return (
    <AIBriefShell
      tag="Team Daily Brief"
      meta={`scope | ${slug(account.name)} | direct book: ${account.total} clients | visible team: ${account.allTotal} clients | ${account.teamSize} RMs | run #${briefRunId}`}
    >
      <div className="max-w-3xl">
        <BriefHeadline {...headline} />
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Link
            className="inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12px] font-semibold text-card transition hover:-translate-y-px"
            href="/manager#approval-queue"
            style={{
              background: "hsl(var(--ai-foreground))",
              boxShadow: "0 8px 18px -8px hsl(var(--ai-foreground) / 0.4)"
            }}
          >
            Open approval queue ({approvalCount})
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </AIBriefShell>
  );
}

/* =============================== Brief shell primitives =============================== */

function AIBriefShell({
  tag,
  meta,
  children
}: {
  tag: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[16px] border p-5 md:p-5"
      style={{
        background:
          "linear-gradient(180deg, hsl(var(--ai-surface)) 0%, hsl(var(--ai-surface-2)) 100%)",
        borderColor: "hsl(var(--ai-border) / 0.45)",
        boxShadow:
          "0 0 0 1px hsl(var(--ai-glow) / 0.05), 0 24px 60px -28px hsl(var(--ai-glow) / 0.32)"
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 0% 0%, hsl(var(--ai-glow) / 0.16) 0%, transparent 50%), radial-gradient(60% 70% at 100% 100%, hsl(var(--ai-accent) / 0.12) 0%, transparent 60%)"
        }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-3.5">
          <span
            className="ai-generated-mark rounded-full border bg-card/70 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider"
            style={{ borderColor: "hsl(var(--ai-border) / 0.45)" }}
          >
            {tag}
          </span>
          <span className="font-mono text-[11px] text-ai-foreground/70">prepared 08:30 SGT | {meta}</span>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

function BriefHeadline({
  lead,
  n1,
  mid,
  n2,
  tail,
  n3,
  end
}: BriefHeadlineModel) {
  return (
    <h2
      className="font-display w-full text-[20px] font-medium leading-[1.28] tracking-tight md:text-[23px]"
      style={{ color: "hsl(var(--ai-foreground))" }}
    >
      {lead}
      <span className="italic text-ai-accent">{n1}</span>
      {mid}
      <span className="italic text-ai-accent">{n2}</span>
      {tail}
      {n3 ? <span className="italic text-ai-accent">{n3}</span> : null}
      {end}
    </h2>
  );
}

function BriefBullets({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-3 border-l pl-5"
      style={{ borderColor: "hsl(var(--ai-border) / 0.4)" }}
    >
      {children}
    </div>
  );
}

function BriefBulletRow({
  index,
  title,
  meta,
  chip
}: {
  index: number;
  title: string;
  meta: string;
  chip: string;
}) {
  return (
    <div className="grid grid-cols-[22px_1fr_auto] items-start gap-3 py-1">
      <span
        className="font-mono text-[11px] text-center leading-[22px]"
        style={{
          background: "hsl(var(--card) / 0.7)",
          border: "1px solid hsl(var(--ai-border) / 0.5)",
          color: "hsl(var(--ai-accent))",
          borderRadius: "6px",
          height: "22px"
        }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div
          className="text-[13px] font-medium leading-[1.45]"
          style={{ color: "hsl(var(--ai-foreground))" }}
        >
          {title}
        </div>
        <div className="mt-1 text-[12px] text-ai-foreground/70">{meta}</div>
      </div>
      <span
        className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{
          background: "hsl(var(--card) / 0.6)",
          borderColor: "hsl(var(--ai-border) / 0.4)",
          color: "hsl(var(--ai-accent))"
        }}
      >
        {chip}
      </span>
    </div>
  );
}

function slug(name: string) {
  return name.toLowerCase().replace(/\s+/g, ".");
}

function buildBriefRunId(scope: "rm" | "mgr", date: string) {
  return `brief-${scope}-${date.replaceAll("-", "")}`;
}

/* ============================ Role Identity Strip ============================ */

function RoleIdentityStrip({
  account,
  variant
}: {
  account: { name: string; role: RMRole; accent: string; title: string };
  variant: "rm" | "manager";
}) {
  const isManager = variant === "manager";
  return (
    <section
      className="grid items-center gap-6 rounded-[16px] border bg-card p-6 shadow-soft md:grid-cols-[auto_1fr_auto]"
      style={{ borderLeft: `4px solid hsl(var(--${account.accent}))`, borderColor: "hsl(var(--border))" }}
    >
      <div>
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{
            background: isManager ? "hsl(var(--brand-navy) / 0.10)" : "hsl(var(--primary-soft))",
            color: isManager ? "hsl(var(--brand-navy))" : "hsl(var(--primary))",
            borderColor: isManager ? "hsl(var(--brand-navy) / 0.24)" : "hsl(var(--primary) / 0.24)"
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {isManager ? "Team todo" : "Today's todo"}
        </span>
      </div>
      <div>
        <h1 className="font-display text-[26px] font-medium tracking-tight md:text-[28px]">
          {isManager ? "Team Workspace" : "Today's Workspace"}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {isManager
            ? "Direct book + team governance / approval load / compliance hygiene."
            : "Prioritize client work, review prepared evidence, and move today's service actions forward."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {variant === "manager" ? (
          <>
            <Link
              href="/manager"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border-strong bg-card px-3 py-2 text-[12px] font-medium text-foreground transition hover:border-primary hover:text-primary"
            >
              Full Management
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground transition hover:bg-primary/90"
              href="/customers"
            >
              Open Client Book
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border-strong bg-card px-3 py-2 text-[12px] font-medium text-foreground transition hover:border-primary hover:text-primary"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Calendar
            </button>
            <Link
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground transition hover:bg-primary/90"
              href="/customers"
            >
              Open Client Book
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

/* ============================ Manager: Team Coverage Strip ============================ */

function TeamCoverageStrip({
  coverage,
  runCount
}: {
  coverage: ReturnType<typeof getRmCoverage>;
  runCount: number;
}) {
  return (
    <section className="rounded-[16px] border border-border bg-card p-6 shadow-soft">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[15px] font-semibold">Team coverage today</div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Per-RM book size, approval load, and scope: Asia Wealth Singapore
          </p>
        </div>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
          {runCount} AI runs / last 60m
        </span>
      </header>
      <div className="grid gap-3 md:grid-cols-3">
        {coverage.map((item) => {
          const accent =
            item.rm.role === "Junior"
              ? "role-junior"
              : item.rm.role === "Manager"
                ? "role-manager"
                : "role-mid";
          return (
            <div
              className="rounded-[12px] border bg-card-soft/50 p-4"
              key={item.rm.rmId}
              style={{ borderLeft: `3px solid hsl(var(--${accent}))`, borderColor: "hsl(var(--border))" }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-semibold">{item.rm.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {getRoleLabel(item.rm.role)} RM / {item.customerCount} clients
                  </div>
                </div>
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    background: `hsl(var(--${accent}) / 0.14)`,
                    color: `hsl(var(--${accent}))`,
                    borderColor: `hsl(var(--${accent}) / 0.3)`
                  }}
                >
                  {getRoleLabel(item.rm.role)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3.5 gap-y-2 tabular">
                <CoverageMetric label="Touches/wk" value={String(item.touchesPerWeek)} />
                <CoverageMetric label="Contacted 90d" value={`${item.contactedIn90dPct}%`} />
                <CoverageMetric
                  label="Approvals"
                  value={String(item.pendingApprovalCount)}
                  warn={item.pendingApprovalCount >= 4}
                />
                <CoverageMetric label="AI runs" value={String(item.aiRunCount)} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CoverageMetric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`font-display mt-1 text-[16px] font-medium leading-none tracking-tight ${warn ? "text-warning" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

/* ============================ Manager: Approval queue ============================ */

function ApprovalQueueCard({
  queue,
  customers,
  rms,
  runs
}: {
  queue: AuditEvent[];
  customers: CustomerProfile[];
  rms: RMUser[];
  runs: AgentRun[];
}) {
  const customerById = new Map(customers.map((c) => [c.customerId, c]));
  const rmById = new Map(rms.map((r) => [r.rmId, r]));
  const runById = new Map(runs.map((run) => [run.runId, run]));
  return (
    <div className="rounded-[16px] border border-border bg-card shadow-soft">
      <header className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
        <div>
          <div className="text-[15px] font-semibold">Awaiting your approval</div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {queue.length} live client-facing drafts - sorted by recency with content and trace
          </p>
        </div>
        <span
          className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
          style={{
            background: "hsl(var(--warning) / 0.12)",
            color: "hsl(var(--warning))",
            borderColor: "hsl(var(--warning) / 0.3)"
          }}
        >
          {queue.length} pending
        </span>
      </header>

      <div className="px-2 py-3">
        {queue.slice(0, 7).map((event) => {
          const customer = event.customerId ? customerById.get(event.customerId) : undefined;
          const actor = rmById.get(event.actorId);
          const run = event.runId ? runById.get(event.runId) : undefined;
          const draft = getDraftReviewSummary(run, event);
          const accent = draft.guardTone === "adjusted" ? "warning" : "success";
          const initials = (customer?.name ?? event.eventId)
            .split(/\s+/)
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <div
              key={event.eventId}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 rounded-[12px] px-4 py-3 transition hover:bg-primary-soft/40"
            >
              <div className="grid h-10 w-10 place-items-center rounded-[10px] border border-primary/20 bg-primary/8 text-[12px] font-semibold text-primary">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">
                  {draft.channelLabel} draft - {draft.title}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {customer?.name ?? "Team item"} / {actor?.name ?? event.actorRole} / {draft.wordCount} words /{" "}
                  {event.timestamp.slice(11, 16)}
                </div>
              </div>
              <span
                className="rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: `hsl(var(--${accent}) / 0.1)`,
                  color: `hsl(var(--${accent}))`,
                  borderColor: `hsl(var(--${accent}) / 0.3)`
                }}
              >
                {draft.guardLabel}
              </span>
              <div className="flex gap-1.5">
                <ApprovalTransitionControls compact initialState={draft.runState} runId={event.runId} />
                <Link
                  href={customer ? approvalHref(customer, event, "trace") : "/manager"}
                  className="rounded-[8px] bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Read draft
                </Link>
              </div>
            </div>
          );
        })}
        {queue.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            Approval queue is clear.
          </div>
        ) : null}
      </div>

      <div className="flex justify-center border-t border-dashed border-border px-4 py-4">
        <Link
          href="/manager"
          className="text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
        >
          See all approvals in Management
        </Link>
      </div>
    </div>
  );
}

function approvalHref(customer: CustomerProfile, event: AuditEvent, mode: "approval" | "trace") {
  const params = new URLSearchParams({
    tab: "ai",
    review: mode,
    event: event.eventId,
    run: event.runId ?? `${customer.customerId}_run_talking_points`
  });
  return `/customers/${customer.customerId}?${params.toString()}`;
}

function returnedDraftHref(event: AuditEvent) {
  if (!event.customerId) return "/workspace";
  const params = new URLSearchParams({
    tab: "ai",
    review: "approval",
    event: event.eventId,
    run: event.runId ?? `${event.customerId}_run_draft`
  });
  return `/customers/${event.customerId}?${params.toString()}`;
}

/* ============================ Manager: Compliance hygiene rail ============================ */

function ComplianceHygieneCard({ hygiene }: { hygiene: ReturnType<typeof getComplianceHygiene> }) {
  return (
    <div className="rounded-[16px] border border-border bg-card shadow-soft">
      <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
        <div>
          <div className="text-[15px] font-semibold">Compliance hygiene</div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Three signals a head of wealth typically asks first
          </p>
        </div>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
          team-wide
        </span>
      </header>
      <div className="grid gap-3 px-5 py-5 md:grid-cols-3">
        <HygieneTile
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Drafts rejected"
          value={`${hygiene.draftsRejectedRate}%`}
          hint={`${hygiene.draftsTouched} drafts touched today / >= 20% threshold`}
          warn={hygiene.draftsRejectedRate >= 20}
        />
        <HygieneTile
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Suitability queue"
          value={String(hygiene.suitabilityExpiring)}
          hint="expiring within 30d or already expired"
          warn={hygiene.suitabilityExpiring > 30}
        />
        <HygieneTile
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Reviews overdue"
          value={String(hygiene.reviewOverdue)}
          hint="past nextReviewDate / >50 threshold"
          warn={hygiene.reviewOverdue > 50}
        />
      </div>
    </div>
  );
}

function HygieneTile({
  icon,
  label,
  value,
  hint,
  warn
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-[12px] border p-4 ${warn ? "" : ""}`}
      style={{
        background: warn ? "hsl(var(--warning) / 0.06)" : "hsl(var(--card-soft) / 0.5)",
        borderColor: warn ? "hsl(var(--warning) / 0.5)" : "hsl(var(--border))"
      }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`font-display mt-2 text-[28px] font-medium leading-none tracking-tight tabular ${warn ? "text-warning" : ""}`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

/* ================================ Workspace status (RM) ================================ */

function WorkspaceStatus({
  briefsReady,
  drafts,
  pendingApprovals,
  queue,
  sent,
  total,
  expanded
}: {
  briefsReady: number;
  drafts: number;
  pendingApprovals: number;
  queue: CustomerProfile[];
  sent: number;
  total: number;
  expanded: boolean;
}) {
  // Drafts ready vs talking-points-only: mirrors ActionRow's aiKind logic
  // so the header counter matches what's rendered per row.
  const draftsReady = queue.filter((c) => {
    const t = getPriorityTier(c.priorityScore);
    return t === "Critical" || t === "Active";
  }).length;
  const talkingPointsOnly = queue.filter((c) => getPriorityTier(c.priorityScore) === "Watch").length;
  return (
    <div className="rounded-[16px] border border-border bg-card shadow-soft">
      <header className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
        <div>
          <div className="text-[15px] font-semibold">Workspace status</div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Action queue, in-flight work, and prepared schedule items in one operating view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="ai-generated-mark rounded-full border px-2.5 py-1 text-[11px] font-medium"
            style={{
              background: "hsl(var(--ai-surface))",
              borderColor: "hsl(var(--ai-border) / 0.45)"
            }}
          >
            {draftsReady} drafts / {talkingPointsOnly} talking points
          </span>
          <Link
            href={expanded ? "/workspace" : "/workspace?queue=full"}
            className="rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {expanded ? "Show 7" : "Show 20"}
          </Link>
        </div>
      </header>

      <div className="px-2 py-3">
        {queue.map((customer) => (
          <ActionRow customer={customer} key={customer.customerId} />
        ))}
      </div>

      {expanded && queue.length < total ? (
        <div className="flex justify-center border-t border-dashed border-border px-4 py-4">
          <Link
            href="/customers"
            className="text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            See all {total} in Client Book
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceQuickStatus({
  briefsReady,
  drafts,
  pendingApprovals,
  queue,
  returnedDrafts,
  sent
}: {
  briefsReady: number;
  drafts: number;
  pendingApprovals: number;
  queue: CustomerProfile[];
  returnedDrafts: AuditEvent[];
  sent: number;
}) {
  return (
    <section className="grid gap-3 md:grid-cols-3">
      <div className="rounded-[14px] border border-[hsl(var(--ai-border)/0.45)] bg-[hsl(var(--ai-surface)/0.62)] px-4 py-3 shadow-soft">
        <div className="mb-1 text-[15px] font-semibold">Work</div>
        <IfRow
          icon={<span className="ai-generated-mark" aria-hidden />}
          tone="ai"
          label="Briefs ready"
          hint="context + source trace"
          count={briefsReady}
          href="/customers"
        />
        {drafts === 0 && returnedDrafts.length === 0 && sent === 0 ? (
          <AllClearRow />
        ) : (
          <>
            <IfRow
              icon={<FileEdit className="h-4 w-4" />}
              tone="ai"
              label="Drafts open"
              hint={pendingApprovals > 0 ? `${pendingApprovals} awaiting review` : "clear"}
              count={drafts}
              href="/customers?priority=high"
            />
            <IfRow
              icon={<AlertTriangle className="h-4 w-4" />}
              tone="warn"
              label="Returned for edit"
              hint={returnedDrafts.length > 0 ? "open and revise" : "none returned"}
              count={returnedDrafts.length}
              href={returnedDrafts[0] ? returnedDraftHref(returnedDrafts[0]) : "/workspace"}
            />
            <IfRow
              icon={<Send className="h-4 w-4" />}
              tone="ai"
              label="Sent today"
              hint="logged in trace"
              count={sent}
              href="/workspace"
            />
          </>
        )}
      </div>

      <div id="calendar" className="rounded-[14px] border border-[hsl(var(--ai-border)/0.45)] bg-[hsl(var(--ai-surface)/0.5)] px-4 py-3 shadow-soft">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="min-w-0 text-[15px] font-semibold">Service windows</div>
          <span className="shrink-0 rounded-[4px] border border-[hsl(var(--brand-gold)/0.45)] bg-[hsl(var(--brand-gold)/0.14)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--ai-foreground))]">
            queue-led
          </span>
        </div>
        <CalendarSchedule customers={queue} />
      </div>

      <div className="rounded-[14px] border border-[hsl(var(--ai-border)/0.45)] bg-[hsl(var(--ai-surface)/0.5)] px-4 py-3 shadow-soft">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="text-[15px] font-semibold">Follow-up</div>
          <span className="rounded-[4px] border border-[hsl(var(--brand-gold)/0.45)] bg-[hsl(var(--brand-gold)/0.14)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--ai-foreground))]">
            ready
          </span>
        </div>
        <IfRow
          icon={<CircleAlert className="h-4 w-4" />}
          tone="ai"
          label="Action checks"
          hint="open Client 360 evidence"
          count={2}
          href={queue[0] ? `/customers/${queue[0].customerId}?tab=ai` : "/customers"}
        />
        <IfRow
          icon={<Send className="h-4 w-4" />}
          tone="ai"
          label="Drafts to prepare"
          hint="approval-aware messages"
          count={2}
          href={queue[1] ? `/customers/${queue[1].customerId}?tab=ai` : "/customers"}
        />
      </div>
    </section>
  );
}

function ActionRow({ customer }: { customer: CustomerProfile }) {
  const tier = getPriorityTier(customer.priorityScore);
  const tone = getPriorityTierTone(tier);
  const review = getReviewStatus(customer.nextReviewDate);
  // Two AI states: a draft is prepared (Critical/Active: needs your action),
  // or talking points are ready (Watch: monitor only, no action urgency).
  // Steady tier: no AI involvement; routine cadence.
  const aiKind: "draft" | "talkingPoints" | "none" =
    tier === "Critical" || tier === "Active" ? "draft" : tier === "Watch" ? "talkingPoints" : "none";
  const tierClass = avatarToneClass(tone);
  const initials = customer.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const cta = ctaForTier(tier);

  return (
    <Link
      className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[12px] border border-transparent px-4 py-3.5 transition hover:border-primary/20 hover:bg-primary-soft/40"
      href={`/customers/${customer.customerId}`}
    >
      <div className="relative">
        <div
          className={`grid h-11 w-11 place-items-center rounded-[12px] border text-[13px] font-semibold ${tierClass}`}
        >
          {initials}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold">{customer.name}</span>
          <Chip>{customer.serviceTier}</Chip>
          <TierBadge tier={tier} />
        </div>
        <div className="mt-1 text-[12px] leading-[1.4] text-muted-foreground">
          <strong className="font-medium text-foreground/85">{getPriorityReason(customer)}.</strong>{" "}
          {customer.segment} segment / {customer.riskProfile} risk profile.
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3.5 text-[11px] text-muted-foreground">
          {aiKind === "draft" ? (
            <span
              className="ai-generated-mark inline-flex items-center gap-1.5 font-medium"
            >
              Prepared draft
            </span>
          ) : aiKind === "talkingPoints" ? (
            <span
              className="ai-generated-mark inline-flex items-center gap-1.5 font-medium"
            >
              Talking points
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Last contact {formatRelativeDays(customer.lastContactedAt)}
          </span>
          {review.kind === "overdue" ? (
            <span className="inline-flex items-center gap-1.5 text-danger">
              <CircleAlert className="h-3 w-3" />
              <span className="ai-signal-text font-semibold">{review.label}</span>
            </span>
          ) : review.kind === "due-soon" ? (
            <span className="inline-flex items-center gap-1.5 text-warning">
              <Clock className="h-3 w-3" />
              <span className="ai-signal-text font-semibold">{review.label}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-medium ${
            cta.primary
              ? "bg-primary text-primary-foreground"
              : "border border-border-strong bg-card text-foreground"
          }`}
        >
          {cta.label}
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

function avatarToneClass(tone: "danger" | "warning" | "primary" | "muted") {
  if (tone === "danger") return "bg-danger/10 text-danger border-danger/25";
  if (tone === "warning") return "bg-warning/12 text-warning border-warning/30";
  if (tone === "primary") return "bg-primary/10 text-primary border-primary/20";
  return "bg-muted text-muted-foreground border-border";
}

function ctaForTier(tier: PriorityTier): { label: string; primary: boolean } {
  if (tier === "Critical") return { label: "Edit & send", primary: true };
  if (tier === "Active") return { label: "Approve brief", primary: false };
  if (tier === "Watch") return { label: "Open Client 360", primary: false };
  return { label: "Touch base", primary: false };
}

function CalendarSchedule({ customers }: { customers: CustomerProfile[] }) {
  const slots = customers.slice(0, 3).map((customer, index) => {
    const review = getReviewStatus(customer.nextReviewDate);
    const tier = getPriorityTier(customer.priorityScore);
    const kind = index === 0 ? "Review prep" : index === 1 ? "Client contact" : "Follow-up";
    const tone =
      review.kind === "overdue" || tier === "Critical"
        ? "primary"
        : tier === "Active" || tier === "Watch"
          ? "ai"
          : "muted";
    return { customer, kind, review, tone } as const;
  });
  return (
    <div className="mb-2 mt-2 space-y-1.5">
      {slots.map((slot, index) => {
        const toneClass =
          slot.tone === "primary"
            ? "border-primary/20 bg-primary-soft text-primary"
            : slot.tone === "ai"
              ? "border-[hsl(var(--ai-border)/0.5)] bg-[hsl(var(--ai-surface)/0.65)] text-[hsl(var(--ai-foreground))]"
              : "border-border bg-muted/50 text-muted-foreground";
        return (
          <Link
            className="grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)_auto] items-center gap-2 rounded-[9px] border border-border/60 bg-card/70 px-2.5 py-2 text-[11px] transition hover:border-primary/40 hover:bg-primary-soft/40"
            href={`/customers/${slot.customer.customerId}`}
            key={slot.customer.customerId}
          >
            <span className="whitespace-nowrap font-mono tabular text-muted-foreground">{slot.review.label}</span>
            <span className="truncate font-medium">{slot.customer.name}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${toneClass}`}>{slot.kind}</span>
          </Link>
        );
      })}
      {slots.length === 0 ? (
        <Link
          className="block rounded-[9px] border border-dashed border-border/70 bg-card/60 px-2.5 py-2 text-[11px] text-muted-foreground transition hover:border-primary/40"
          href="/customers"
        >
          Open Client Book to prepare service windows.
        </Link>
      ) : null}
    </div>
  );
}

function AllClearRow() {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-3 border-b border-border/50 py-3 last:border-0">
      <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-success/12 text-success">
        <Send className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium">No drafts in flight - all clear</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">Returned edits and sent items are clear for today.</div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
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
  const dotCls =
    tone === "danger"
      ? "bg-danger"
      : tone === "warning"
        ? "bg-warning"
        : tone === "primary"
          ? "bg-primary"
          : "bg-muted-foreground/60";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
      {tier}
    </span>
  );
}

/* ============================== In-flight rail (RM) ============================== */

function InFlightWork({
  briefsReady,
  drafts,
  sent,
  pendingApprovals
}: {
  briefsReady: number;
  drafts: number;
  sent: number;
  pendingApprovals: number;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-card shadow-soft">
      <header className="border-b border-border/50 px-5 py-4">
        <div className="text-[15px] font-semibold">In-flight work</div>
        <p className="mt-1 text-[12px] text-muted-foreground">What AI prepared, what shipped today</p>
      </header>
      <div className="px-5 py-3">
        <IfRow
          icon={<span className="ai-generated-mark" aria-hidden />}
          tone="ai"
          label="Briefs ready"
          hint="open a customer to read context + sources"
          count={briefsReady}
        />
        <IfRow
          icon={<FileEdit className="h-4 w-4" />}
          tone="warn"
          label="Drafts pending"
          hint={pendingApprovals > 0 ? `${pendingApprovals} awaiting approval` : "awaiting your edit + approve"}
          count={drafts}
          countTone="warning"
        />
        <IfRow
          icon={<Send className="h-4 w-4" />}
          tone="success"
          label="Sent today"
          hint={`${sent} logged in audit trail`}
          count={sent}
        />

        <div className="my-2 border-t border-dashed border-border" />

        <IfRow
          icon={<CalendarClock className="h-4 w-4" />}
          tone="muted"
          label="Meetings today"
          hint="2 prepared / 1 awaiting brief"
          count={3}
          preview
        />
        <IfRow
          icon={<CircleAlert className="h-4 w-4" />}
          tone="ai"
          label="Follow-ups ready"
          hint="Client 360 evidence - review before send"
          count={2}
        />
      </div>
      <div
        className="mx-5 mb-5 mt-2 rounded-[10px] border border-dashed px-3.5 py-3 text-[12px] leading-[1.5]"
        style={{
          borderColor: "hsl(var(--ai-border) / 0.5)",
          background: "hsl(var(--ai-surface) / 0.5)",
          color: "hsl(var(--ai-foreground) / 0.85)"
        }}
      >
        AI is the evidence behind action. Open any customer to see the trace, source records, and approval state for every output.
      </div>
    </div>
  );
}

function IfRow({
  icon,
  tone,
  label,
  hint,
  count,
  countTone,
  href,
  preview
}: {
  icon: React.ReactNode;
  tone: "ai" | "warn" | "success" | "muted";
  label: string;
  hint: string;
  count: number;
  countTone?: "warning";
  href?: string;
  preview?: boolean;
}) {
  const iconCls =
    tone === "ai"
      ? "bg-transparent text-ai-accent"
      : tone === "warn"
        ? "bg-warning/14 text-warning"
        : tone === "success"
          ? "bg-success/12 text-success"
          : "bg-muted text-muted-foreground";
  const previewLabel = tone === "ai" ? "MVP" : "Preview";
  const rowClass = `grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border/50 py-3 last:border-0 ${preview && tone !== "ai" ? "opacity-70" : ""} ${href && count > 0 ? "rounded-[8px] px-1 transition hover:bg-[hsl(var(--ai-surface)/0.7)]" : ""}`;
  const content = (
    <>
      <span className={`grid h-8 w-8 place-items-center rounded-[8px] ${iconCls}`}>{icon}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium">{label}</span>
          {preview ? (
            <span className="rounded-[4px] bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {previewLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <span
        className={`font-display text-[16px] font-semibold ${countTone === "warning" ? "text-warning" : ""}`}
      >
        {count}
      </span>
    </>
  );
  if (href && count > 0) {
    return (
      <Link className={rowClass} href={href}>
        {content}
      </Link>
    );
  }
  return (
    <div className={rowClass}>
      {content}
    </div>
  );
}

/* =============================== Market & Audit =============================== */

function MarketTone({ market }: { market: Awaited<ReturnType<ReturnType<typeof getRepo>["getLatestMarketSnapshot"]>> }) {
  return (
    <div className="rounded-[16px] border border-border bg-card shadow-soft">
      <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
        <div>
          <div className="text-[15px] font-semibold">Market tone</div>
          <p className="mt-1 text-[12px] text-muted-foreground">Asia open / 09:00 SGT</p>
        </div>
        <span
          className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
          style={{
            background:
              market?.sentiment === "Cautious" ? "hsl(var(--warning) / 0.12)" : "hsl(var(--muted))",
            color:
              market?.sentiment === "Cautious"
                ? "hsl(var(--warning))"
                : "hsl(var(--muted-foreground))",
            borderColor:
              market?.sentiment === "Cautious"
                ? "hsl(var(--warning) / 0.3)"
                : "hsl(var(--border))"
          }}
        >
          {market?.sentiment ?? "Neutral"}
        </span>
      </header>
      <div className="px-5 py-4">
        <p className="text-[13px] leading-[1.45]">{market?.headline ?? "Demo market data."}</p>
        {market?.indices && market.indices.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-2 tabular">
            {market.indices.slice(0, 3).map((idx) => (
              <div className="rounded-[8px] border border-border/50 bg-muted/50 px-3 py-2.5" key={idx.name}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{idx.name}</div>
                <div className="font-display mt-1.5 text-[16px] font-semibold leading-none tracking-tight">
                  {idx.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div
                  className={`mt-1 text-[11px] font-medium ${idx.changePct >= 0 ? "text-success" : "text-danger"}`}
                >
                  {idx.changePct >= 0 ? "+" : ""}
                  {idx.changePct.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
