import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CircleAlert,
  FileText,
  ListChecks,
  Mail,
  MessageSquareText,
  PhoneCall,
  Plus
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortfolioAllocationChart } from "@/components/portfolio-allocation-chart";
import { NextActionsPanel, type NextActionItem } from "@/components/copilot/next-actions-panel";
import { TalkingPointsSurface, type SuggestedTalkingPoint } from "@/components/copilot/talking-points-surface";
import { AIOutput } from "@/components/ai/ai-output";
import {
  formatRelativeDays,
  getContactFreshnessTone,
  getPriorityReason,
  getPriorityTier,
  getPriorityTierTone,
  getReviewStatus
} from "@/lib/domain/client-signals";
import { getRiskAlignment, getRiskComplianceSummary, type ComplianceState } from "@/lib/domain/risk-compliance";
import { RiskAlignmentCard } from "@/components/risk/risk-alignment-card";
import { getCurrentAccount } from "@/lib/auth/server-session";
import { getRepo } from "@/lib/repo";
import { formatCurrency } from "@/lib/utils/format";
import type { Account, AgentRun, AuditEvent, CustomerProfile, Holding, LifecycleEvent, Product, RMRole, Transaction } from "@/lib/repo/types";

type PageProps = {
  params: Promise<{ customerId: string }>;
  searchParams?: Promise<{
    tab?: string;
    tx?: "full";
    review?: "approval" | "trace";
    event?: string;
    run?: string;
  }>;
};

type TabId = "holdings" | "alignment" | "activity" | "ai";

const tabs: { id: TabId; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: "holdings",
    label: "Holdings",
    icon: <FileText className="h-3.5 w-3.5" />,
    description: "Accounts, positions, allocation chart, and lifecycle signals that affect the portfolio review."
  },
  {
    id: "alignment",
    label: "Alignment",
    icon: <CircleAlert className="h-3.5 w-3.5" />,
    description: "Check whether portfolio risk, allocation, liquidity, concentration, or compliance has drifted from where it should be."
  },
  {
    id: "activity",
    label: "Activity",
    icon: <ListChecks className="h-3.5 w-3.5" />,
    description: "Transactions, lifecycle signals, documents, and communication evidence in one operating view."
  },
  {
    id: "ai",
    label: "Copilot",
    icon: <span className="ai-generated-mark" aria-hidden />,
    description: "Prepared client context, next actions, trace, and evidence for RM preparation."
  }
];

function normalizeTab(tab?: string): TabId | undefined {
  if (!tab) return undefined;
  // Legacy aliases �?keep old URLs alive.
  if (tab === "risk") return "alignment";
  if (tab === "portfolio" || tab === "overview" || tab === "accounts" || tab === "charts") return "holdings";
  if (tab === "documents" || tab === "communication" || tab === "events" || tab === "transactions") return "activity";
  if (tab === "holdings" || tab === "alignment" || tab === "activity" || tab === "ai") return tab;
  return undefined;
}

function makeCustomerTabHref(
  customerId: string,
  tab: TabId,
  review?: { mode?: "approval" | "trace"; event?: string; run?: string }
) {
  const params = new URLSearchParams({ tab });
  if (review?.mode) params.set("review", review.mode);
  if (review?.event) params.set("event", review.event);
  if (review?.run) params.set("run", review.run);
  return `/customers/${customerId}?${params.toString()}`;
}

export default async function CustomerPage({ params, searchParams }: PageProps) {
  const { customerId } = await params;
  const query = await searchParams;
  const requestedTab = normalizeTab(query?.tab);
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab! : "holdings";
  const showFullTransactions = query?.tx === "full";
  const reviewMode = query?.review === "approval" || query?.review === "trace" ? query.review : undefined;

  const repo = getRepo();
  const account = await getCurrentAccount();
  const [customer, canView] = await Promise.all([
    repo.getCustomer(customerId),
    repo.canViewCustomer(customerId, { rmId: account.rmId, role: account.role })
  ]);

  if (!customer) notFound();
  if (!canView) return <PermissionRequired accountName={account.name} />;

  const [accounts, holdings, allTransactions, events, runs, products, auditEvents] = await Promise.all([
    repo.listAccounts(customerId),
    repo.listHoldings(customerId),
    repo.listTransactions(customerId),
    repo.listLifecycleEvents(customerId),
    repo.listAgentRuns({ customerId, limit: 6 }),
    repo.listProducts(),
    repo.listAuditEvents({ customerId })
  ]);

  const visibleTransactions = showFullTransactions ? allTransactions : allTransactions.slice(0, 10);
  const latestRun = runs[0];
  const reviewEvent = reviewMode && query?.event
    ? auditEvents.find((event) => event.eventId === query.event)
    : undefined;
  const reviewRun = reviewMode
    ? normalizeReviewRun((query?.run ? runs.find((run) => run.runId === query.run) : undefined) ?? latestRun)
    : undefined;
  const productById = new Map(products.map((product) => [product.productId, product]));
  const riskMismatches = holdings.filter((holding) => holding.riskStatus === "mismatch");
  const tier = getPriorityTier(customer.priorityScore);
  const tierTone = getPriorityTierTone(tier);
  const compliance = getRiskComplianceSummary(customer, holdings, products);
  const alignment = getRiskAlignment(customer, holdings, products);
  const portfolioRiskMismatches = alignment.actualScore > alignment.profileScore ? riskMismatches : [];
  const communicationEvents = auditEvents.filter((event) => event.type === "client.opened" || event.type === "draft.sent");
  const communicationRows = buildCommunicationLog(customer, communicationEvents, events);
  const documents = demoDocuments(customer);
  const canTouchCustomer = customer.rmId === account.rmId;

  return (
    <main className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Link className="hover:text-primary" href="/customers">
          Client Book
        </Link>
        <span className="opacity-50">/</span>
        <span className="text-foreground">{customer.name}</span>
        <span className="opacity-50">/</span>
        <span className="font-mono tabular">{customer.customerId}</span>
      </div>

      {reviewMode ? (
        <ApprovalReviewPanel
          compliance={compliance}
          customer={customer}
          event={reviewEvent}
          mode={reviewMode}
          run={reviewRun}
          viewerRole={account.role}
        />
      ) : null}

      {/* Identity card */}
      <IdentityCard customer={customer} role={account.role} tier={tier} tierTone={tierTone} canTouchCustomer={canTouchCustomer} />

      {/* KPI strip */}
      <KpiStrip customer={customer} compliance={compliance} />

      {/* Tabs */}
      <nav className="flex gap-6 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Link
              className={`font-display -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-0 pb-3 pt-3 transition ${
                active
                  ? "border-primary text-[17px] font-semibold text-foreground"
                  : "border-transparent text-[15px] font-medium text-muted-foreground hover:text-foreground"
              }`}
              href={makeCustomerTabHref(customer.customerId, tab.id, {
                mode: reviewMode,
                event: query?.event,
                run: query?.run
              })}
              key={tab.id}
              title={tab.description}
            >
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Main canvas */}
      <div>
        <div className="flex flex-col gap-4">
          {activeTab === "holdings" ? (
            <PortfolioTab accounts={accounts} customerId={customer.customerId} events={events} holdings={holdings} productById={productById} products={products} />
          ) : null}
          {activeTab === "alignment" ? (
            <AlignmentTab
              customer={customer}
              holdings={holdings}
              portfolioRiskMismatches={portfolioRiskMismatches}
              productById={productById}
            />
          ) : null}
          {activeTab === "activity" ? (
            <ActivityTab
              communicationRows={communicationRows}
              customerId={customer.customerId}
              documents={documents}
              events={events}
              showFull={showFullTransactions}
              products={productById}
              total={allTransactions.length}
              transactions={visibleTransactions}
            />
          ) : null}
          {activeTab === "ai" ? <AIInsightsTab customer={customer} compliance={compliance} latestRun={latestRun} canTouchCustomer={canTouchCustomer} /> : null}
        </div>
      </div>
    </main>
  );
}

/* ============================== Identity card ============================== */

function IdentityCard({
  canTouchCustomer,
  customer,
  role,
  tier,
  tierTone
}: {
  canTouchCustomer: boolean;
  customer: CustomerProfile;
  role: RMRole;
  tier: string;
  tierTone: "danger" | "warning" | "primary" | "muted";
}) {
  const review = getReviewStatus(customer.nextReviewDate);
  const contactTone = getContactFreshnessTone(customer.lastContactedAt);
  const tierAccent = customer.serviceTier === "VIP" ? "brand-gold" : "brand-blue";
  const tierText = customer.serviceTier === "VIP" ? "hsl(var(--brand-navy))" : "hsl(var(--brand-blue))";
  return (
    <div
      className="relative grid items-center gap-7 overflow-hidden rounded-[18px] border border-border bg-card p-7 shadow-soft md:grid-cols-[auto_1fr_auto]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            `radial-gradient(800px 200px at 0% 0%, hsl(var(--${tierAccent}) / 0.14), transparent 70%)`
        }}
      />
      {/* Avatar */}
      <div
        className="relative grid h-[72px] w-[72px] place-items-center rounded-full text-[22px] font-semibold"
        style={{
          background:
            `linear-gradient(135deg, hsl(var(--${tierAccent}) / 0.28), hsl(var(--${tierAccent}) / 0.10))`,
          color: tierText,
          border: `1px solid hsl(var(--${tierAccent}) / 0.46)`
        }}
      >
        {customer.avatarInitials}
      </div>

      {/* Identity meta */}
      <div className="relative">
        <h1 className="font-display flex items-center gap-3 text-[32px] font-medium leading-[1.1] tracking-tight">
          {customer.name}
          <span
            className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: `hsl(var(--${tierAccent}) / ${customer.serviceTier === "VIP" ? "0.26" : "0.12"})`,
              color: tierText,
              borderColor: `hsl(var(--${tierAccent}) / 0.4)`
            }}
          >
            {customer.serviceTier} / {customer.segment}
          </span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Pill tone={tierTone}>{tier} priority</Pill>
          {review.kind === "overdue" ? <Pill tone="warning">{review.label}</Pill> : null}
          <Pill tone={contactTone}>Last contact {formatRelativeDays(customer.lastContactedAt)}</Pill>
          {customer.tags.includes("RiskMismatch") ? <Pill tone="warning">Risk mismatch</Pill> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-foreground">
          <span>
            <span className="font-medium text-foreground/85">Profession</span> / {customer.profession}
          </span>
          <span>
            <span className="font-medium text-foreground/85">Domicile</span> /{" "}
            {customer.location.city}
          </span>
          <span>
            <span className="font-medium text-foreground/85">Risk profile</span> / {customer.riskProfile}
          </span>
          <span>
            <span className="font-medium text-foreground/85">Funding</span> / {customer.fundingCurrency}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="relative flex items-center gap-2">
        {canTouchCustomer ? (
          <>
            <Link
              href={makeClientCopilotHref(customer.customerId, {
                module: "draft_assist",
                channel: "call_script",
                intent: `Prepare a concise call opener for ${customer.name}. Focus on ${getPriorityReason(customer)} and keep evidence visible before client-facing action.`
              })}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[hsl(var(--ai-border)/0.55)] bg-[hsl(var(--ai-surface)/0.72)] px-3 py-2 text-[12px] font-medium text-[hsl(var(--ai-accent))] transition hover:border-[hsl(var(--ai-accent)/0.55)]"
            >
              <PhoneCall className="h-3.5 w-3.5" />
              Call prep
            </Link>
            <Link
              href={makeClientCopilotHref(customer.customerId, {
                module: "draft_assist",
                channel: "email",
                intent: `Prepare a concise review email for ${customer.name}. Use the current review, portfolio, and compliance context for RM approval.`
              })}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[hsl(var(--ai-border)/0.48)] bg-[hsl(var(--ai-surface-2)/0.62)] px-3 py-2 text-[12px] font-medium text-[hsl(var(--ai-foreground))] transition hover:border-[hsl(var(--ai-accent)/0.45)]"
            >
              <Mail className="h-3.5 w-3.5" />
              Email
            </Link>
            {role === "Junior" ? (
              <Link
                href={makeClientCopilotHref(customer.customerId, {
                  module: "draft_assist",
                  channel: "email",
                  intent: `Prepare a manager-review draft for ${customer.name}. Keep approval evidence explicit for Junior RM workflow.`
                })}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[hsl(var(--brand-gold)/0.5)] bg-[hsl(var(--brand-gold)/0.16)] px-3 py-2 text-[12px] font-semibold text-[hsl(var(--ai-foreground))] transition hover:border-[hsl(var(--ai-accent)/0.45)]"
              >
                <MessageSquareText className="h-3.5 w-3.5" />
                Manager review
              </Link>
            ) : (
              <Link
                href={makeClientCopilotHref(customer.customerId, {
                  module: "draft_assist",
                  channel: "whatsapp",
                  intent: `Prepare a short client check-in for ${customer.name}. Keep it factual, warm, and client-friendly.`
                })}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[hsl(var(--brand-gold)/0.5)] bg-[hsl(var(--brand-gold)/0.16)] px-3 py-2 text-[12px] font-semibold text-[hsl(var(--ai-foreground))] transition hover:border-[hsl(var(--ai-accent)/0.45)]"
              >
                <Plus className="h-3.5 w-3.5" />
                WhatsApp note
              </Link>
            )}
          </>
        ) : (
          <div className="max-w-[220px] rounded-[12px] border border-border bg-background/78 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            View-only customer. Approval review stays available above; touch actions belong to the owning RM.
          </div>
        )}
      </div>
    </div>
  );
}

function ApprovalReviewPanel({
  customer,
  compliance,
  event,
  mode,
  run,
  viewerRole
}: {
  customer: CustomerProfile;
  compliance: ReturnType<typeof getRiskComplianceSummary>;
  event?: AuditEvent;
  mode: "approval" | "trace";
  run?: AgentRun;
  viewerRole: RMRole;
}) {
  const review = getReviewStatus(customer.nextReviewDate);
  const reviewContent = formatReviewContent(run, customer);
  const title = "AI trace review";
  const status = mode === "approval" ? "Pending review" : "Trace opened";
  return (
    <section
      className="sticky top-[88px] z-30 rounded-[18px] border bg-card p-4 shadow-lift"
      style={{
        borderColor: "hsl(var(--ai-border) / 0.62)",
        boxShadow: "0 18px 48px hsl(var(--brand-navy) / 0.14)"
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="ai-generated-mark text-[12px] font-semibold uppercase tracking-wider text-[hsl(var(--ai-accent))]">
            {title}
          </div>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            {customer.name} / {review.label} / {compliance.worst} compliance state
          </p>
        </div>
        <Link className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted" href={`/customers/${customer.customerId}?tab=ai`}>
          Close
        </Link>
      </div>

      {run ? (
        <AIOutput
          title={title}
          status={status}
          generatedAt={run.finishedAt}
          summary={`${customer.name} / ${review.label} / ${compliance.worst} compliance state`}
          run={run}
          viewerRole={viewerRole}
        >
          <div className="rounded-[12px] border border-[hsl(var(--ai-border)/0.5)] bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-semibold">Content to review</div>
              <span className="rounded-full border border-[hsl(var(--brand-gold)/0.45)] bg-[hsl(var(--brand-gold)/0.12)] px-2 py-1 text-[11px] font-medium text-[hsl(var(--brand-navy))]">
                {status}
              </span>
            </div>
            <p className="mt-2 max-h-[220px] overflow-y-auto whitespace-pre-line text-[12px] leading-5 text-muted-foreground">
              {reviewContent}
            </p>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Event: {event?.type ?? "latest AI run"} / Run: {run.runId}
            </div>
          </div>
        </AIOutput>
      ) : (
        <div className="rounded-[14px] border border-dashed border-border bg-card/78 p-4 text-[13px] leading-6 text-muted-foreground">
          No prepared run was found for this queue item. Open Copilot to generate a fresh reviewable output with trace.
        </div>
      )}
    </section>
  );
}

function normalizeReviewRun(run?: AgentRun): AgentRun | undefined {
  if (!run) return undefined;
  const moduleId = run.moduleId ?? "talking_points";
  return {
    ...run,
    moduleId,
    requestedRuntime: run.requestedRuntime ?? "deterministic",
    backend: run.backend ?? "deterministic",
    model: run.model ?? "demo-seed",
    llmProvider: run.llmProvider ?? "local-demo",
    skillVersion: run.skillVersion ?? "seed-run@v1",
    state: run.state ?? "prepared",
    approvalRequired:
      run.approvalRequired ?? (moduleId === "draft_assist" ? (run.roleAtRun === "Junior" ? "manager-approval" : "rm-approval") : "auto"),
    cached: run.cached ?? true,
    vocabularyAdjusted: run.vocabularyAdjusted ?? false
  };
}

function formatReviewContent(run: AgentRun | undefined, customer: CustomerProfile) {
  const output = run?.output;
  if (isRecord(output)) {
    if (typeof output.draft === "string" && output.draft.trim()) {
      return output.draft.trim();
    }
    if (typeof output.plainLanguage === "string" && output.plainLanguage.trim()) {
      return output.plainLanguage.trim();
    }
    if (Array.isArray(output.bullets)) {
      const bullets = output.bullets.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      if (bullets.length > 0) return bullets.map((item) => `- ${item}`).join("\n");
    }
    if (Array.isArray(output.actions)) {
      const actions = output.actions
        .map((item) => isRecord(item) && typeof item.label === "string" ? item.label : undefined)
        .filter((item): item is string => Boolean(item));
      if (actions.length > 0) return actions.map((item) => `- ${item}`).join("\n");
    }
  }
  return [
    `Prepared review item for ${customer.name}.`,
    `Priority reason: ${getPriorityReason(customer)}.`,
    "Open trace and approval controls below before any client-facing action."
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Pill({
  tone,
  children
}: {
  tone: "danger" | "warning" | "primary" | "muted" | "success";
  children: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "bg-danger/10 text-danger border-danger/30"
      : tone === "warning"
        ? "bg-warning/12 text-warning border-warning/30"
        : tone === "primary"
          ? "bg-primary-soft text-primary border-primary/30"
          : tone === "success"
            ? "bg-success/12 text-success border-success/30"
            : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

/* ============================== Evidence strip ============================== */

function HeroAIAlert({
  customer,
  compliance
}: {
  customer: CustomerProfile;
  compliance: ReturnType<typeof getRiskComplianceSummary>;
}) {
  const reason = getPriorityReason(customer);
  const hasDrift = customer.tags.includes("RiskMismatch");
  const needsApproval = compliance.worst === "Block";
  return (
    <div
      className="grid items-center gap-4 rounded-[14px] border border-border bg-card px-4 py-3 shadow-soft md:grid-cols-[auto_1fr_auto]"
      style={{
        boxShadow: "inset 4px 0 0 hsl(var(--ai-accent) / 0.62), var(--shadow-soft)"
      }}
    >
      <div className="grid h-9 w-9 place-items-center rounded-full border border-ai-border/55 bg-ai-surface/65">
        <span className="ai-generated-mark" aria-hidden />
      </div>
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Evidence surfaced / Beacon Risk Engine
        </div>
        <div className="max-w-[820px] text-[13px] leading-5 text-foreground">
          <strong className="font-semibold">{reason}.</strong>{" "}
          {compliance.liquidity.detail || compliance.concentration.detail || compliance.suitability.detail}
        </div>
        <div className="mt-1.5 font-mono text-[10px] text-muted-foreground tabular">
          trace / {customer.customerId.slice(0, 4)} / sources kyc + portfolio
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {hasDrift || needsApproval ? (
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[hsl(var(--ai-border)/0.7)] bg-card px-3 py-1.5 text-[11px] font-medium text-ai-accent transition hover:bg-ai-surface/55"
          >
            Open evidence
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
        >
          Inspect trace
        </button>
      </div>
    </div>
  );
}

/* ============================== KPI strip ============================== */

function KpiStrip({
  customer,
  compliance
}: {
  customer: CustomerProfile;
  compliance: ReturnType<typeof getRiskComplianceSummary>;
}) {
  const yoy = customer.aumYoyChangePct;
  const flow = customer.netFlow30d;
  const yoyTone = yoy >= 0 ? "up" : "dn";
  const priorityTooltip = buildPriorityScoreTooltip(customer);
  return (
    <section className="grid gap-3 md:grid-cols-4">
      <Kpi
        label="AUM"
        value={formatCurrency(customer.totalAum, customer.currency)}
        delta={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span>
              {yoy >= 0 ? "up" : "down"} {Math.abs(yoy).toFixed(1)}% YoY / 30d flow{" "}
              {flow >= 0 ? "+" : "-"}{formatCurrency(Math.abs(flow), customer.currency)}
            </span>
            <SyntheticPreviewChip />
          </span>
        }
        deltaTone={yoyTone}
      />
      <Kpi
        label="Risk profile"
        value={customer.riskProfile}
        delta={`Funding ${customer.fundingCurrency}`}
        deltaTone="muted"
      />
      <Kpi
        label="Priority"
        value={getPriorityTier(customer.priorityScore)}
        delta={
          <span>
            score{" "}
            <span className="cursor-help underline decoration-dotted underline-offset-2" title={priorityTooltip}>
              {customer.priorityScore}
            </span>
          </span>
        }
        deltaTone="muted"
        valueTone={getPriorityTierTone(getPriorityTier(customer.priorityScore))}
      />
      <Kpi
        label="Liquidity"
        value={`${100 - compliance.liquidity.illiquidPct}%`}
        delta={`illiquid ${compliance.liquidity.illiquidPct}% / cap 35%`}
        deltaTone={compliance.liquidity.illiquidPct > 35 ? "dn" : "up"}
      />
    </section>
  );
}

function SyntheticPreviewChip() {
  return (
    <span
      className="inline-flex cursor-help items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
      title="Synthetic preview: production will derive this from transaction history."
      style={{
        borderColor: "hsl(var(--brand-gold) / 0.45)",
        background: "hsl(var(--brand-gold) / 0.12)"
      }}
    >
      synth
    </span>
  );
}

function Kpi({
  label,
  value,
  delta,
  deltaTone,
  valueTone
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  deltaTone?: "up" | "dn" | "muted";
  valueTone?: "danger" | "warning" | "primary" | "muted";
}) {
  const valueClass =
    valueTone === "danger"
      ? "text-danger"
      : valueTone === "warning"
        ? "text-warning"
        : valueTone === "primary"
          ? "text-primary"
          : "";
  const deltaClass =
    deltaTone === "up" ? "text-success" : deltaTone === "dn" ? "text-danger" : "text-muted-foreground";
  return (
    <div className="rounded-[10px] border border-border bg-card px-3.5 py-3 shadow-soft">
      <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className={`font-display mt-1.5 text-[18px] font-medium leading-none tracking-tight tabular ${valueClass}`}>
        {value}
      </div>
      {delta ? <div className={`mt-1.5 text-[10px] tabular ${deltaClass}`}>{delta}</div> : null}
    </div>
  );
}

function buildPriorityScoreTooltip(customer: CustomerProfile) {
  const tagWeight = customer.tags.length * 11;
  const eventBoost = customer.tags.includes("Lifecycle") || customer.tags.includes("HighValue")
    ? 12
    : customer.tags.includes("MarketMove")
      ? 6
      : 0;
  const reviewBoost = customer.nextReviewDate < new Date().toISOString().slice(0, 10) ? 8 : 0;
  const zeroAumPenalty = customer.totalAum === 0 ? -40 : 0;
  return [
    "Demo priority score = base 38",
    `${customer.tags.length} signal tag(s) x 11 = +${tagWeight}`,
    eventBoost ? `event boost = +${eventBoost}` : "no event boost",
    reviewBoost ? `review overdue = +${reviewBoost}` : "review not overdue",
    zeroAumPenalty ? "zero-AUM dormant penalty = -40" : "no zero-AUM penalty",
    "plus bounded demo jitter for variety"
  ].join("; ");
}

/* ============================== AI cards ============================== */

function AIRailCard({
  tag,
  timestamp,
  children
}: {
  tag: string;
  timestamp: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-[16px] border"
      style={{
        background:
          "linear-gradient(180deg, hsl(var(--ai-accent-pink) / 0.055) 0%, hsl(var(--brand-gold) / 0.075) 100%)",
        borderColor: "hsl(var(--brand-gold) / 0.32)",
        boxShadow: "0 0 0 4px hsl(var(--ai-accent-pink) / 0.018), var(--shadow-soft)"
      }}
    >
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <div className="ai-generated-mark font-display text-[18px] font-medium tracking-tight">
          {tag}
        </div>
        <div className="font-mono text-[10px]" style={{ color: "hsl(var(--brand-gold) / 0.72)" }}>
          {timestamp}
        </div>
      </div>
      <div className="px-5 pb-4">{children}</div>
    </div>
  );
}

function RailFooter({ trace, cta }: { trace: string; cta: string }) {
  return (
    <div
      className="-mx-5 mt-3 flex items-center justify-between border-t px-5 pt-3"
      style={{ borderColor: "hsl(var(--brand-gold) / 0.34)" }}
    >
      <span className="font-mono text-[10px]" style={{ color: "hsl(var(--ai-foreground) / 0.6)" }}>
        {trace}
      </span>
      <button
        type="button"
        className="text-[11px] font-medium"
        style={{ color: "hsl(var(--ai-accent-pink))" }}
      >
        {cta}
      </button>
    </div>
  );
}

function Talkpoint({ n, body, source }: { n: string; body: string; source: string }) {
  return (
    <div className="grid grid-cols-[22px_1fr] gap-2 py-2">
      <div className="font-mono text-[11px]" style={{ color: "hsl(var(--ai-accent-pink))" }}>
        {n}
      </div>
      <div className="text-[13px]" style={{ color: "hsl(var(--ai-foreground))" }}>
        {body}
        <div className="mt-1 text-[11px]" style={{ color: "hsl(var(--ai-foreground) / 0.65)" }}>
          {source}
        </div>
      </div>
    </div>
  );
}

function NbaButton({ label, hint, primary }: { label: string; hint?: string; primary?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-between gap-2 rounded-[10px] px-3.5 py-2.5 text-[12px] ${
        primary
          ? "font-semibold text-[hsl(var(--brand-navy))]"
          : "border font-medium text-foreground"
      }`}
      style={
        primary
          ? {
              background:
                "linear-gradient(135deg, hsl(var(--ai-accent-pink) / 0.92), hsl(var(--brand-gold) / 0.92))"
            }
          : {
              background:
                "linear-gradient(135deg, hsl(var(--ai-accent-pink) / 0.08), hsl(var(--brand-gold) / 0.10))",
              borderColor: "hsl(var(--brand-gold) / 0.42)"
            }
      }
    >
      <span>{label}</span>
      {hint ? (
        <span
          className="font-mono text-[10px]"
          style={{ color: primary ? "hsl(var(--brand-navy) / 0.68)" : "hsl(var(--ai-accent-pink))" }}
        >
          {hint}
        </span>
      ) : null}
    </button>
  );
}

function BehavRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium">{value}</span>
    </div>
  );
}

/* ============================== Tabs (kept content blocks) ============================== */

function PermissionRequired({ accountName }: { accountName: string }) {
  return (
    <main className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Customer Permission Required</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            {accountName} cannot view this customer. Switch to the assigned RM account or Manager to inspect this profile.
          </p>
          <div className="mt-4 flex gap-2">
            <Button asChild>
              <Link href="/login">Switch Account</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/customers">Client Book</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function PortfolioTab({
  accounts,
  events,
  holdings,
  productById,
  products,
  customerId
}: {
  accounts: Account[];
  events: LifecycleEvent[];
  holdings: Holding[];
  productById: Map<string, Product>;
  products: Product[];
  customerId: string;
}) {
  return (
    <section className="space-y-4">
      <AccountsTab accounts={accounts} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <HoldingsTab customerId={customerId} holdings={holdings} productById={productById} />
        <ChartsTab holdings={holdings} products={products} />
      </div>
      <RecentSignalsPanel events={events} />
    </section>
  );
}

function RecentSignalsPanel({ events }: { events: LifecycleEvent[] }) {
  const signals = events.slice(0, 3);
  if (signals.length === 0) return null;

  return (
    <Card>
      <CardHeader
        className="border-b border-[hsl(var(--brand-gold)/0.32)]"
        style={{
          background:
            "linear-gradient(180deg, hsl(var(--ai-accent-pink) / 0.055) 0%, hsl(var(--brand-gold) / 0.075) 100%)"
        }}
      >
        <CardTitle className="font-display text-[22px] font-medium tracking-tight ai-signal-text">
          <span className="inline-flex items-center gap-2">
            <span className="ai-generated-mark" aria-hidden />
            Recent Signals
          </span>
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Lifecycle Signals that may affect the holding review.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {signals.map((event) => (
          <EventCard event={event} key={event.eventId} />
        ))}
      </CardContent>
    </Card>
  );
}

function AccountsTab({ accounts }: { accounts: Account[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="border-b border-border/65"
        style={{
          background:
            "linear-gradient(90deg, hsl(var(--brand-blue) / 0.09), hsl(var(--brand-navy) / 0.045))"
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="font-display text-[22px] font-medium tracking-tight">Accounts</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Investment account structure, funding currency, cash and market value.
            </p>
          </div>
          <Badge variant="outline">{accounts.length} accounts</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {accounts.map((account, index) => {
          const accent = index % 3 === 0 ? "brand-blue" : index % 3 === 1 ? "brand-navy" : "brand-gold";
          return (
            <div
              className="grid gap-4 rounded-[14px] border bg-background/72 p-4 transition hover:bg-card lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.45fr)]"
              key={account.accountId}
              style={{
                borderColor: `hsl(var(--${accent}) / 0.26)`,
                boxShadow: `inset 5px 0 0 hsl(var(--${accent}))`
              }}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">{account.type}</div>
                  <Badge variant={account.status === "Active" ? "success" : "warning"}>{account.status}</Badge>
                  <Badge variant="outline">{account.currency}</Badge>
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground tabular">{account.accountId}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm xl:grid-cols-4">
                <Info label="Cash" value={formatCurrency(account.cashBalance, account.currency)} />
                <Info label="Market value" value={formatCurrency(account.marketValue, account.currency)} />
                <Info label="Opened" value={account.openedAt} />
                <Info label="Funding" value={account.currency} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function HoldingsTab({ customerId, holdings, productById }: { customerId: string; holdings: Holding[]; productById: Map<string, Product> }) {
  const total = holdings.reduce((sum, holding) => sum + holding.value, 0) || 1;
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader
        className="border-b border-border/65"
        style={{
          background:
            "linear-gradient(90deg, hsl(var(--brand-navy) / 0.06), hsl(var(--brand-blue) / 0.07))"
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="font-display text-[22px] font-medium tracking-tight">Positions</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Linked products, account currency, concentration and risk state.</p>
          </div>
          <Badge variant="outline">{holdings.length} lines</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-4">
        {holdings.map((holding) => {
          const product = productById.get(holding.productId);
          const concentration = (holding.value / total) * 100;
          return (
            <div className="grid gap-3 rounded-[12px] border border-border bg-background/70 p-3 transition hover:border-primary/28 hover:bg-primary-soft/28 xl:grid-cols-[1fr_0.78fr_0.48fr_0.55fr_0.36fr]" key={holding.holdingId}>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{product?.name ?? holding.productId}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{product?.family ?? "Product"} - {product?.geography ?? "Unknown"}</div>
              </div>
              <div className="text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{product?.category ?? "Product"}</Badge>
                  <span className="text-xs text-muted-foreground">{product?.riskLevel ?? "Risk pending"}</span>
                  <Link
                    className="rounded-full border border-[hsl(var(--ai-border)/0.38)] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--ai-accent-pink))] transition hover:bg-[hsl(var(--brand-gold)/0.10)]"
                    href={makeClientCopilotHref(customerId, {
                      module: "term_explainer",
                      intent: `Explain ${product?.name ?? holding.productId}, ${product?.category ?? "product"} risk, fees, and why it matters for this customer's portfolio review.`
                    })}
                  >
                    Explain
                  </Link>
                </div>
                <div className="text-xs text-muted-foreground">Mgmt fee {product?.fees.managementBps ?? 0} bps</div>
              </div>
              <div className="text-sm font-semibold tabular">{formatCurrency(holding.value, holding.currency)}</div>
              <div className="min-w-[92px]">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-primary-soft">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, concentration * 4)}%` }} />
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-primary tabular">{concentration.toFixed(1)}%</span>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Concentration</div>
              </div>
              <div className="flex justify-start xl:justify-end">
                <Badge variant={holding.riskStatus === "mismatch" ? "warning" : "success"}>{holding.riskStatus}</Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ActivityTab({
  communicationRows,
  customerId,
  documents,
  events,
  products,
  showFull,
  total,
  transactions
}: {
  communicationRows: ReturnType<typeof buildCommunicationLog>;
  customerId: string;
  documents: ReturnType<typeof demoDocuments>;
  events: LifecycleEvent[];
  products: Map<string, Product>;
  showFull: boolean;
  total: number;
  transactions: Transaction[];
}) {
  return (
    <section className="space-y-4">
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <section className="flex min-h-[360px] flex-col overflow-hidden rounded-[12px] border border-border bg-card">
            <header
              className="flex items-start justify-between gap-3 border-b border-border/65 px-4 py-3"
              style={{
                background:
                  "linear-gradient(90deg, hsl(var(--brand-blue) / 0.08), hsl(var(--brand-navy) / 0.04))"
              }}
            >
              <div>
                <div className="font-display text-[22px] font-medium tracking-tight">Transactions</div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Posted account movements and product activity. Showing {transactions.length} of {total}.
                </p>
              </div>
              {total > transactions.length || showFull ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/customers/${customerId}?tab=activity${showFull ? "" : "&tx=full"}`}>
                    {showFull ? "Show recent 10" : "Show more"}
                  </Link>
                </Button>
              ) : null}
            </header>
            <div className="flex-1 px-4 py-2">
              {transactions.map((tx) => {
                const product = tx.productId ? products.get(tx.productId) : undefined;
                const isPositive = ["BUY", "SUBSCRIBE", "DEPOSIT", "DIVIDEND"].includes(tx.action);
                return (
                  <div className="grid grid-cols-[72px_1fr_auto] gap-3 border-b border-dashed border-border py-3 last:border-0" key={tx.transactionId}>
                    <div className="font-mono text-[11px] leading-5 text-muted-foreground tabular">
                      {formatTimelineDate(tx.tradeDate)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium leading-5">
                        {tx.action} {product?.name ?? "Cash movement"}
                      </div>
                      <div className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
                        {tx.currency} / value date {tx.valueDate}
                      </div>
                    </div>
                    <div className={`text-right text-[12px] font-semibold tabular ${isPositive ? "text-success" : ""}`}>
                      {formatCurrency(tx.totalAmount, tx.currency)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex min-h-[360px] flex-col overflow-hidden rounded-[12px] border border-[hsl(var(--brand-gold)/0.32)] bg-card">
            <header
              className="border-b border-[hsl(var(--brand-gold)/0.32)] px-4 py-3"
              style={{
                background:
                  "linear-gradient(180deg, hsl(var(--ai-accent-pink) / 0.055) 0%, hsl(var(--brand-gold) / 0.075) 100%)"
              }}
            >
              <div className="font-display ai-signal-text flex items-center gap-2 text-[22px] font-medium tracking-tight">
                <span className="ai-generated-mark" aria-hidden />
                Lifecycle Signals
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Signals for service timing, not transaction records.</p>
            </header>
            <div className="flex-1 px-4 py-2">
              {events.map((event) => (
                <div className="border-b border-dashed border-border py-3 last:border-0" key={event.eventId}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-[11px] text-muted-foreground tabular">{formatTimelineDate(event.date)}</div>
                    <Badge variant={event.importance === "High" ? "warning" : "secondary"}>{event.importance}</Badge>
                  </div>
                  <div className="mt-1.5 text-[13px] font-medium leading-5">{event.title}</div>
                  <div className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{event.description}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <DocumentsCompact documents={documents} />
          <CommunicationCompact rows={communicationRows} />
        </div>
    </section>
  );
}

function DocumentsCompact({ documents }: { documents: ReturnType<typeof demoDocuments> }) {
  return (
    <section className="flex min-h-[285px] flex-col overflow-hidden rounded-[12px] border border-border bg-card">
      <header
        className="border-b border-border/65 px-4 py-3"
        style={{
          background:
            "linear-gradient(90deg, hsl(var(--brand-blue) / 0.06), hsl(var(--brand-navy) / 0.035))"
        }}
      >
        <div className="font-display text-[22px] font-medium tracking-tight">Documents</div>
        <p className="mt-1 text-[11px] text-muted-foreground">Compact status only until the document store is wired.</p>
      </header>
      <div className="flex-1 px-4 py-2">
        {/* TODO: Phase 5 - wire to real document store. */}
        {documents.slice(0, 4).map((doc) => (
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-dashed border-border py-3 last:border-0" key={doc.name}>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{doc.name}</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular">{doc.date}</div>
            </div>
            <Badge variant={doc.state === "Current" ? "success" : doc.state === "Due soon" ? "warning" : "outline"}>{doc.state}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}

function CommunicationCompact({ rows }: { rows: ReturnType<typeof buildCommunicationLog> }) {
  return (
    <section className="flex min-h-[285px] flex-col overflow-hidden rounded-[12px] border border-border bg-card">
      <header
        className="border-b border-border/65 px-4 py-3"
        style={{
          background:
            "linear-gradient(90deg, hsl(var(--brand-blue) / 0.06), hsl(var(--brand-navy) / 0.035))"
        }}
      >
        <div className="font-display text-[22px] font-medium tracking-tight">Communication</div>
        <p className="mt-1 text-[11px] text-muted-foreground">Recent touchpoints and draft activity.</p>
      </header>
      <div className="flex-1 px-4 py-2">
        {/* TODO: Phase 5 - wire to real communication store. */}
        {rows.slice(0, 4).map((row) => (
          <div className="grid grid-cols-[78px_72px_1fr] gap-3 border-b border-dashed border-border py-3 last:border-0" key={`${row.date}-${row.summary}`}>
            <div className="font-mono text-[11px] text-muted-foreground tabular">{row.date}</div>
            <Badge variant="outline">{row.channel}</Badge>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{row.actor}</div>
              <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{row.summary}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChartsTab({ holdings, products }: { holdings: Holding[]; products: Product[] }) {
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader
        className="border-b border-border/65"
        style={{
          background:
            "linear-gradient(90deg, hsl(var(--brand-gold) / 0.16), hsl(var(--brand-blue) / 0.07))"
        }}
      >
        <CardTitle className="font-display text-[22px] font-medium tracking-tight">Allocation Chart</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Category mix with colour legend; values are shown as portfolio percentages.
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <PortfolioAllocationChart holdings={holdings} products={products} showValues={false} layout="stack" />
      </CardContent>
    </Card>
  );
}

function AlignmentTab({
  customer,
  holdings,
  portfolioRiskMismatches,
  productById
}: {
  customer: CustomerProfile;
  holdings: Holding[];
  portfolioRiskMismatches: Holding[];
  productById: Map<string, Product>;
}) {
  const mismatches = holdings.filter((holding) => holding.riskStatus === "mismatch");
  const products = [...productById.values()];
  const summary = getRiskComplianceSummary(customer, holdings, products);

  return (
    <section className="space-y-4">
      <RiskAlignmentCard
        customer={customer}
        holdings={holdings}
        products={products}
        reviewDisclosure={
          portfolioRiskMismatches.length > 0 ? (
            <RiskReviewDisclosure count={portfolioRiskMismatches.length} customer={customer} mismatches={portfolioRiskMismatches} productById={productById} />
          ) : undefined
        }
      />

      <div className="rounded-[10px] border border-border bg-card-soft/50 p-3 text-[12px] text-muted-foreground">
        Dyna Beacon surfaces evidence and trace. Suitability, eligibility, approval, and final client action remain
        institution-owned. See <code className="font-mono">docs/SCORING.md</code> for compliance rule definitions and per-institution customization.
      </div>

      <section className="space-y-3">
        <AlignmentSectionHeader
          title="Compliance Dimensions"
          description="Four clickable checks. Open a card to see the evidence behind the state."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <ComplianceGroupCard
            title="Client file"
            state={worstState(summary.suitability.state, summary.knowledge.state)}
            detail="Suitability validity and K&E status."
          >
            <Info label="Suitability" value={summary.suitability.detail} wide />
            <Info label="Last completed" value={summary.suitability.completedAt} />
            <Info label="Expires" value={summary.suitability.expiresAt} />
            <Info label="K&E status" value={summary.knowledge.status} />
          </ComplianceGroupCard>

          <ComplianceGroupCard
            title="Portfolio limits"
            state={worstState(summary.concentration.state, summary.liquidity.state)}
            detail="Concentration and illiquid exposure limits."
          >
            <Info label="Concentration" value={summary.concentration.detail} wide />
            {summary.concentration.topPosition ? (
              <Info label="Top position" value={`${summary.concentration.topPosition.name} - ${summary.concentration.topPosition.pct.toFixed(1)}%`} wide />
            ) : null}
            {summary.concentration.topCategory ? (
              <Info label="Top category" value={`${summary.concentration.topCategory.category} - ${summary.concentration.topCategory.pct.toFixed(1)}%`} wide />
            ) : null}
            <Info label="Illiquid %" value={`${summary.liquidity.illiquidPct}%`} />
            <Info label="Soft / hard limit" value="35% / 50%" />
          </ComplianceGroupCard>

          <ComplianceGroupCard title="Currency exposure" state={summary.currency.state} detail={summary.currency.detail}>
            <Info label="Funding currency" value={summary.currency.fundingCurrency} />
            <Info label="Off-funding %" value={`${summary.currency.nonFundingPct}%`} />
            {summary.currency.breakdown.length > 0 ? (
              <div className="md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Breakdown</div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {summary.currency.breakdown.map((b) => (
                    <span className="rounded-md border border-border bg-background px-2 py-0.5" key={b.currency}>
                      {b.currency} {b.pct}%
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </ComplianceGroupCard>

          <ComplianceGroupCard title="Risk alignment" state={mismatches.length === 0 ? "Pass" : "Watch"} detail={mismatches.length === 0 ? "No mismatch on file." : `${mismatches.length} holding(s) above customer risk band.`}>
            <Info label="Mismatch holdings" value={String(mismatches.length)} wide />
            <Info label="Profile" value={customer.riskProfile} />
            <Info label="Action" value="Open portfolio drift evidence before client-facing action." wide />
          </ComplianceGroupCard>
        </div>
      </section>

    </section>
  );
}

function AIInsightsTab({
  canTouchCustomer,
  customer,
  compliance,
  latestRun
}: {
  canTouchCustomer: boolean;
  customer: CustomerProfile;
  compliance: ReturnType<typeof getRiskComplianceSummary>;
  latestRun?: AgentRun;
}) {
  const suggestedPoints = buildSuggestedTalkingPoints(customer, compliance);
  const nextActions = buildNextActions(customer, compliance, Boolean(latestRun), suggestedPoints);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
        <AIRailCard tag="AI Suggested Talking Points" timestamp="4 selectable points">
          <TalkingPointsSurface customerId={customer.customerId} suggestedPoints={suggestedPoints} />
        </AIRailCard>
        <AIRailCard tag="Next Best Action" timestamp={latestRun ? "trace ready" : "ranked"}>
          <NextActionsPanel actions={nextActions} customerId={customer.customerId} canExecute={canTouchCustomer} />
        </AIRailCard>
      </div>
    </section>
  );
}

function buildSuggestedTalkingPoints(
  customer: CustomerProfile,
  compliance: ReturnType<typeof getRiskComplianceSummary>
): SuggestedTalkingPoint[] {
  const review = getReviewStatus(customer.nextReviewDate);
  const priorityTier = getPriorityTier(customer.priorityScore);
  const contact = formatRelativeDays(customer.lastContactedAt).toLowerCase();
  const complianceFocus = compliance.worst === "Pass"
    ? "Compliance dimensions are clear."
    : `${compliance.worst} compliance state needs review.`;

  return [
    {
      id: "relationship-context",
      title: `${priorityTier} relationship context`,
      body: getPriorityReason(customer),
      source: `Reason: last contact ${contact}`
    },
    {
      id: "portfolio-alignment",
      title: "Portfolio alignment",
      body: `Check portfolio fit against the ${customer.riskProfile} profile.`,
      source: "Reason: holdings + allocation checks"
    },
    {
      id: "review-compliance",
      title: "Review readiness",
      body: `${review.label}; ${complianceFocus}`,
      source: "Reason: review date + suitability/K&E"
    },
    {
      id: "rm-custom",
      title: "RM custom input",
      body: "Prepare a calm pre-call brief and avoid advisory language.",
      source: "RM input",
      editable: true
    }
  ];
}

function buildNextActions(
  customer: CustomerProfile,
  compliance: ReturnType<typeof getRiskComplianceSummary>,
  hasLatestRun: boolean,
  suggestedPoints: SuggestedTalkingPoint[]
): NextActionItem[] {
  const review = getReviewStatus(customer.nextReviewDate);
  const contact = formatRelativeDays(customer.lastContactedAt).toLowerCase();
  const actionPrefix = hasLatestRun ? "Use latest Copilot run" : "Prepare a fresh Copilot run";
  const [relationshipPoint, portfolioPoint, reviewPoint] = suggestedPoints;

  return [
    {
      id: "nba-relationship-context",
      label: "Open relationship check-in",
      hint: `${relationshipPoint?.body ?? getPriorityReason(customer)} / last contact ${contact}`,
      reason: `${actionPrefix} from talking point 01: ${relationshipPoint?.title ?? "Relationship context"}. The action is to prepare a concise client opener before discussing portfolio detail.`,
      executeLabel: "Open WhatsApp opener",
      channel: "whatsapp",
      talkingPointId: relationshipPoint?.id,
      talkingPointTitle: relationshipPoint?.title
    },
    {
      id: "nba-portfolio-alignment",
      label: "Prepare portfolio review email",
      hint: portfolioPoint?.body ?? `Check portfolio fit against the ${customer.riskProfile} profile.`,
      reason: `${actionPrefix} from talking point 02: ${portfolioPoint?.title ?? "Portfolio alignment"}. The action is to open Draft Assist so the RM can convert portfolio context into client-friendly language.`,
      executeLabel: "Open email draft",
      channel: "email",
      talkingPointId: portfolioPoint?.id,
      talkingPointTitle: portfolioPoint?.title
    },
    {
      id: "nba-review-readiness",
      label: "Prepare review call opener",
      hint: reviewPoint?.body ?? `${review.label}; ${compliance.worst} compliance state.`,
      reason: `${actionPrefix} from talking point 03: ${reviewPoint?.title ?? "Review readiness"}. The action is to prepare a call opener or meeting note before any client-facing follow-up.`,
      executeLabel: "Open call opener",
      channel: "call",
      talkingPointId: reviewPoint?.id,
      talkingPointTitle: reviewPoint?.title
    },
    {
      id: "approval-check",
      label: "Check approval path",
      hint: `${compliance.worst} compliance state`,
      reason: compliance.worst === "Pass"
        ? "Compliance Dimensions are currently pass-state, but Beacon keeps approval evidence visible before client-facing action."
        : `${compliance.worst} compliance state means the RM should inspect suitability, K&E, currency, liquidity, and concentration evidence before sending anything.`,
      executeLabel: "Open approval checklist",
      channel: "approval"
    }
  ];
}

function AlignmentSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="font-display text-[20px] font-medium tracking-tight">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function ComplianceStateBadge({ state }: { state: ComplianceState }) {
  const cls =
    state === "Block"
      ? "bg-[hsl(var(--brand-navy))] text-[hsl(var(--brand-offwhite))]"
      : state === "Watch"
        ? "bg-[hsl(var(--brand-gold)/0.24)] text-[hsl(var(--brand-navy))]"
        : state === "Pass"
          ? "bg-primary-soft text-primary"
          : "bg-muted text-muted-foreground";
  const label = state === "Block" ? "Action required" : state === "Watch" ? "Review" : state === "Pass" ? "On track" : "Not checked";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function worstState(...states: ComplianceState[]): ComplianceState {
  if (states.includes("Block")) return "Block";
  if (states.includes("Watch")) return "Watch";
  if (states.includes("NotChecked")) return "NotChecked";
  return "Pass";
}

function ComplianceGroupCard({
  title,
  state,
  detail,
  children
}: {
  title: string;
  state: ComplianceState;
  detail: string;
  children: React.ReactNode;
}) {
  const borderClass =
    state === "Block"
      ? "border-[hsl(var(--brand-navy)/0.42)]"
      : state === "Watch"
        ? "border-[hsl(var(--brand-gold)/0.56)]"
        : state === "Pass"
          ? "border-primary/28"
          : "border-border";
  return (
    <details className={`group overflow-hidden rounded-[12px] border bg-card ${borderClass}`}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 marker:hidden">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">{title}</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
          <span className="mt-2 inline-flex text-[11px] font-medium text-primary group-open:hidden">Open evidence</span>
        </div>
        <ComplianceStateBadge state={state} />
      </summary>
      <div className="grid gap-3 border-t border-border/60 px-4 pb-4 pt-3 text-sm md:grid-cols-2">{children}</div>
    </details>
  );
}

function RiskReviewDisclosure({
  count,
  customer,
  mismatches,
  productById
}: {
  count: number;
  customer: CustomerProfile;
  mismatches: Holding[];
  productById: Map<string, Product>;
}) {
  return (
    <details className="group overflow-hidden rounded-[12px] border border-[hsl(var(--brand-gold)/0.46)] bg-[hsl(var(--brand-gold)/0.09)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-4 marker:hidden">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 text-warning" />
          <div>
            <div className="font-semibold">Portfolio Risk Review Required</div>
            <div className="text-sm text-muted-foreground">
              {count} holding(s) are marked as mismatch. Review evidence and approval state before client-facing action.
            </div>
          </div>
        </div>
        <span className="rounded-[8px] border border-[hsl(var(--brand-gold)/0.55)] bg-card px-3 py-1.5 text-[11px] font-medium text-[hsl(var(--brand-navy))] transition group-open:bg-[hsl(var(--brand-gold)/0.16)]">
          See details
        </span>
      </summary>
      <div className="space-y-2 border-t border-[hsl(var(--brand-gold)/0.36)] bg-card/62 p-4">
        {mismatches.map((holding) => {
          const product = productById.get(holding.productId);
          return (
            <div className="rounded-md border border-warning/35 bg-warning/10 p-3" key={holding.holdingId}>
              <div className="text-sm font-semibold">{product?.name ?? holding.productId}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Product risk {product?.riskLevel ?? "pending"} - customer risk {customer.riskProfile} - {holding.pctOfAum.toFixed(1)}% of AUM
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function EventCard({ event }: { event: LifecycleEvent }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{event.title}</div>
        <Badge variant={event.importance === "High" ? "warning" : "secondary"}>{event.importance}</Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{event.date} - {event.type}</div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{event.description}</p>
    </div>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function makeClientCopilotHref(
  customerId: string,
  options: {
    module: "draft_assist" | "term_explainer";
    intent: string;
    channel?: "email" | "whatsapp" | "call_script";
  }
) {
  const params = new URLSearchParams({
    copilot: options.module,
    copilotCustomerId: customerId,
    copilotIntent: options.intent
  });
  if (options.channel) params.set("copilotChannel", options.channel);
  return `/customers/${customerId}?${params.toString()}`;
}

function formatTimelineDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function demoDocuments(customer: CustomerProfile) {
  return [
    { name: "KYC profile", date: "2026-01-18", state: "Current", detail: `${customer.name} identity, address, and source-of-funds profile.` },
    { name: "Suitability questionnaire", date: customer.suitabilityExpiresAt, state: "Due soon", detail: "Annual suitability refresh and risk profile evidence." },
    { name: "K&E assessment", date: customer.suitabilityCompletedAt, state: customer.knowledgeAssessmentStatus === "Expired" ? "Expired" : "Current", detail: `Knowledge and experience status: ${customer.knowledgeAssessmentStatus}.` },
    { name: "Investment policy statement", date: "2025-11-22", state: "Current", detail: "Portfolio constraints, liquidity guidance, and concentration limits." },
    { name: "Investment proposals", date: "2026-04-28", state: "Current", detail: "Drafted scenarios and RM-reviewed product comparison packs." },
    { name: "Statements Q1 2026", date: "2026-03-31", state: "Current", detail: "Quarterly statement and transaction summary." },
    { name: "Tax documents", date: "2025-12-31", state: "Current", detail: "Year-end reporting package for client records." }
  ];
}

function buildCommunicationLog(customer: CustomerProfile, auditEvents: AuditEvent[], events: LifecycleEvent[]) {
  const auditRows = auditEvents.map((event) => ({
    date: event.timestamp.slice(0, 10),
    channel: event.type === "draft.sent" ? "Email" : "Workspace",
    actor: event.actorId,
    summary: event.type === "draft.sent" ? "Client-facing draft sent and logged in audit trail." : "Client profile opened for preparation."
  }));
  const lifecycleRows = events
    .filter((event) => event.type === "Review" || event.type === "LifeEvent")
    .slice(0, 2)
    .map((event) => ({
      date: event.date,
      channel: "RM note",
      actor: "Dyna Beacon",
      summary: `${event.title}: ${event.description}`
    }));
  return [
    {
      date: customer.lastContactedAt ?? "No date",
      channel: "Call",
      actor: customer.rmId,
      summary: "Last recorded client contact. Summary placeholder until communication store is wired."
    },
    ...auditRows,
    ...lifecycleRows
  ].sort((a, b) => b.date.localeCompare(a.date));
}
