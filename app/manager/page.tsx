import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ClockAlert,
  FileWarning,
  Plus
} from "lucide-react";
import { ApprovalTransitionControls } from "@/components/copilot/approval-transition-controls";
import { getDraftReviewSummary } from "@/lib/copilot/draft-summary";
import { getCurrentAccount } from "@/lib/auth/server-session";
import { getRoleLabel } from "@/lib/auth/accounts";
import { daysUntil } from "@/lib/domain/client-signals";
import {
  getApprovalQueue,
  getComplianceHygiene,
  getRmCoverage
} from "@/lib/domain/governance";
import { getRepo } from "@/lib/repo";
import { formatCurrency } from "@/lib/utils/format";
import type { AgentRun, AuditEvent, CustomerProfile, RMUser } from "@/lib/repo/types";

type PageProps = {
  searchParams?: Promise<{ event?: string; window?: "today" | "week" | "mtd" | "qtd" }>;
};

const windowOptions: { id: "today" | "week" | "mtd" | "qtd"; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "mtd", label: "MTD" },
  { id: "qtd", label: "QTD" }
];

export default async function ManagerPage({ searchParams }: PageProps) {
  const account = await getCurrentAccount();
  if (account.role !== "Manager") {
    return <PermissionRequired accountName={account.name} role={account.role} />;
  }

  const params = await searchParams;
  const activeEvent = params?.event ?? "all";
  const activeWindow = params?.window ?? "today";

  const repo = getRepo();
  const [customers, managerDirectBook, runs, auditEvents, rms] = await Promise.all([
    repo.listCustomers({ role: "Manager" }),
    repo.listCustomers({ ownedBy: account.rmId }),
    repo.listAgentRuns(),
    repo.listAuditEvents(),
    repo.listRms()
  ]);

  const approvalQueue = getApprovalQueue(auditEvents);
  const coverage = getRmCoverage(rms, customers.items, runs, auditEvents);
  const hygiene = getComplianceHygiene(customers.items, auditEvents);
  void activeEvent;
  const customerById = new Map(customers.items.map((c) => [c.customerId, c]));
  const rmById = new Map(rms.map((rm) => [rm.rmId, rm]));

  const totalAum = customers.items.reduce((acc, customer) => acc + customer.totalAum, 0);
  const clientsWithContactHistory = customers.items.filter((c) => c.lastContactedAt).length;
  const driftCustomers = customers.items.filter((c) => c.tags.includes("RiskMismatch"));
  const driftCases = driftCustomers.length;
  const driftScope = {
    rmCount: new Set(driftCustomers.map((customer) => customer.rmId)).size,
    vipPrivateCount: driftCustomers.filter(
      (customer) => customer.serviceTier === "VIP" || customer.serviceTier === "Private"
    ).length
  };
  const complianceFlags = hygiene.draftsRejectedRate >= 20 ? 2 : 0;

  return (
    <main className="space-y-5">
      {/* Header + window pivot */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] font-medium leading-[1.1] tracking-tight">Team management</h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-[1.5] text-muted-foreground">
            <strong className="text-foreground">{account.name}</strong> / Asia Wealth / {rms.length} RMs /{" "}
            {customers.total} clients / {formatCurrency(totalAum, "USD", { compact: true })} AUM. View team performance, approve drafts,
            and surface risk before it surfaces to compliance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full border border-border/60 bg-muted/60 p-1">
            {windowOptions.map((win) => (
              <Link
                key={win.id}
                href={`/manager?window=${win.id}${activeEvent !== "all" ? `&event=${activeEvent}` : ""}`}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition ${
                  activeWindow === win.id
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                }`}
              >
                {win.label}
              </Link>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border-strong bg-card px-3 py-2 text-[12px] font-medium text-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Manager AI brief */}
      <ManagerBrief
        approvalCount={approvalQueue.length}
        driftCases={driftCases}
        driftScope={driftScope}
        directBookSize={managerDirectBook.total}
        coverage={coverage}
      />

      {/* KPI strip */}
      <section className="grid gap-3 md:grid-cols-5">
        <Kpi label="Team AUM" value={formatCurrency(totalAum, "USD", { compact: true })} delta="aggregated book" deltaTone="up" />
        <Kpi
          label="Clients in scope"
          value={String(customers.total)}
          delta={`${clientsWithContactHistory} with contact history`}
          deltaTone="muted"
        />
        <Kpi
          label="Drafts pending you"
          value={String(approvalQueue.length)}
          delta="awaiting your review"
          valueTone={approvalQueue.length > 0 ? "warning" : undefined}
        />
        <Kpi
          label="Risk drift cases"
          value={String(driftCases)}
          delta={`${Math.min(2, driftCases)} critical / ${Math.max(0, driftCases - 2)} watch`}
          deltaTone={driftCases > 0 ? "dn" : "muted"}
          valueTone={driftCases > 0 ? "danger" : undefined}
        />
        <Kpi
          label="Compliance flags (30d)"
          value={String(complianceFlags)}
          delta={hygiene.draftsRejectedRate >= 20 ? "rejected >= 20%" : "within tolerance"}
          deltaTone={complianceFlags > 0 ? "dn" : "muted"}
        />
      </section>

      {/* Two-col main */}
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-4">
          <TeamPerformanceCard coverage={coverage} customers={customers.items} />
          <RiskDriftCard customers={customers.items} />
          <ComplianceHygieneCard hygiene={hygiene} />
        </div>

        <div className="flex flex-col gap-4">
          <ApprovalQueueCard
            queue={approvalQueue}
            customers={customers.items}
            rms={rms}
            runs={runs}
            customerById={customerById}
            rmById={rmById}
          />
        </div>
      </section>
    </main>
  );
}

/* ============================== Manager AI brief ============================== */

function ManagerBrief({
  approvalCount,
  driftCases,
  driftScope,
  directBookSize,
  coverage
}: {
  approvalCount: number;
  driftCases: number;
  driftScope: { rmCount: number; vipPrivateCount: number };
  directBookSize: number;
  coverage: ReturnType<typeof getRmCoverage>;
}) {
  const heaviest = [...coverage].sort((a, b) => b.pendingApprovalCount - a.pendingApprovalCount)[0];
  const overloaded = [...coverage].sort((a, b) => b.touchesPerWeek - a.touchesPerWeek)[0];
  const briefItems = [
    ...(approvalCount > 0 && heaviest
      ? [`Draft approvals: ${heaviest.rm.name} has ${heaviest.pendingApprovalCount} pending; ${approvalCount} total across the team.`]
      : []),
    ...(driftCases > 0
      ? [`Portfolio drift: ${driftCases} clients across ${driftScope.rmCount} RM books; ${driftScope.vipPrivateCount} are VIP/Private.`]
      : []),
    `Team load: your direct book holds ${directBookSize} clients; ${overloaded ? `${overloaded.rm.name} runs the heaviest weekly cadence.` : "team load is balanced."}`
  ];

  return (
    <div
      className="grid gap-5 rounded-[18px] border p-6 md:grid-cols-[auto_1fr]"
      style={{
        background:
          "linear-gradient(135deg, hsl(var(--role-manager) / 0.14) 0%, hsl(var(--ai-surface-2)) 100%)",
        borderColor: "hsl(var(--role-manager) / 0.36)",
        boxShadow: "0 0 0 4px hsl(var(--role-manager) / 0.08)"
      }}
    >
      <div
        className="grid h-14 w-14 place-items-center rounded-[14px] text-[24px]"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--ai-border))",
          color: "hsl(var(--ai-accent))",
          fontFamily: "var(--font-display)"
        }}
      >
        <span className="ai-generated-mark text-[22px]" aria-hidden />
      </div>
      <div>
        <div className="ai-generated-mark mb-1.5 text-[10px] font-medium uppercase tracking-[0.1em]">
          Beacon manager brief - 09:14 SGT
        </div>
        <h2
          className="font-display mb-2.5 text-[22px] font-medium leading-[1.3] tracking-tight"
          style={{ color: "hsl(var(--ai-foreground))" }}
        >
          Items that need{" "}
          <strong style={{ color: "hsl(var(--ai-accent))", fontWeight: 600 }}>your</strong> attention before market open.
        </h2>
        <ol className="mb-3 grid max-w-[920px] gap-1.5 text-[13px] leading-[1.5]" style={{ color: "hsl(var(--ai-foreground) / 0.85)" }}>
          {briefItems.map((item, index) => (
            <li key={item} className="grid grid-cols-[22px_1fr] gap-2">
              <strong style={{ color: "hsl(var(--ai-accent))" }}>{index + 1}.</strong>
              <span>{item}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {approvalCount > 0 ? (
            <Link
              href="#approval-queue"
              className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold text-white"
              style={{ background: "hsl(var(--ai-accent))" }}
            >
              Open approval queue ({approvalCount})
            </Link>
          ) : null}
          <Link
            href="#risk-review"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border-strong bg-card px-3 py-2 text-[12px] font-medium text-foreground"
          >
            Review drift cases ({driftCases})
          </Link>
        </div>
        <div
          className="mt-3 font-mono text-[10px] tabular"
          style={{ color: "hsl(var(--ai-foreground) / 0.55)" }}
        >
          Prepared from team activity and portfolio drift signals.
        </div>
      </div>
    </div>
  );
}

/* ============================== KPI ============================== */

function Kpi({
  label,
  value,
  delta,
  deltaTone,
  valueTone
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "dn" | "muted";
  valueTone?: "danger" | "warning";
}) {
  const valueClass = valueTone === "danger" ? "text-danger" : valueTone === "warning" ? "text-warning" : "";
  const deltaClass = deltaTone === "up" ? "text-success" : deltaTone === "dn" ? "text-danger" : "text-muted-foreground";
  return (
    <div className="rounded-[12px] border border-border bg-card p-4 shadow-soft">
      <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className={`font-display mt-2 text-[24px] font-medium leading-none tracking-tight tabular ${valueClass}`}>
        {value}
      </div>
      {delta ? <div className={`mt-1.5 text-[11px] tabular ${deltaClass}`}>{delta}</div> : null}
    </div>
  );
}

/* ============================== Team performance ============================== */

function TeamPerformanceCard({
  coverage,
  customers
}: {
  coverage: ReturnType<typeof getRmCoverage>;
  customers: CustomerProfile[];
}) {
  const totalCustomers = customers.length || 1;
  return (
    <div id="approval-queue" className="rounded-[16px] border border-border bg-card p-6 shadow-soft">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight">Team performance</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {coverage.length} RMs / sorted by book load
        </span>
      </header>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th>RM</Th>
            <Th>Book</Th>
            <Th>Book load</Th>
            <Th>Touches/wk</Th>
            <Th>Approvals</Th>
            <Th>Health</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {coverage.map((item) => {
            const aum = customers
              .filter((c) => c.rmId === item.rm.rmId)
              .reduce((acc, c) => acc + c.totalAum, 0);
            const capacityPct = Math.round((item.customerCount / Math.max(1, totalCustomers / coverage.length)) * 100);
            const accentKey =
              item.rm.role === "Junior" ? "role-junior" : item.rm.role === "Manager" ? "role-manager" : "role-mid";
            const health = capacityPct > 105 ? "watch" : item.contactedIn90dPct < 60 ? "behind" : "good";
            const viewHref = item.rm.role === "Manager" ? "/customers" : `/customers?role=${item.rm.role}`;
            const initials = item.rm.name
              .split(/\s+/)
              .map((p) => p[0])
              .join("")
              .slice(0, 2);
            return (
              <tr key={item.rm.rmId} className="hover:bg-muted/40">
                <Td>
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-9 w-9 place-items-center rounded-[10px] border text-[12px] font-semibold"
                      style={{
                        background: `hsl(var(--${accentKey}) / 0.15)`,
                        color: `hsl(var(--${accentKey}))`,
                        borderColor: `hsl(var(--${accentKey}) / 0.3)`
                      }}
                    >
                      {initials}
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold leading-tight">{item.rm.name}</div>
                      <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span
                          className="rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                          style={{
                            background: `hsl(var(--${accentKey}) / 0.14)`,
                            color: `hsl(var(--${accentKey}))`
                          }}
                        >
                          {getRoleLabel(item.rm.role)}
                        </span>
                        Asia Wealth
                      </div>
                    </div>
                  </div>
                </Td>
                <Td>
                  <span className="font-mono text-[12px] tabular">
                    {item.customerCount} / {formatCurrency(aum, "USD", { compact: true })}
                  </span>
                </Td>
                <Td>
                  <CapacityBar pct={capacityPct} />
                </Td>
                <Td>
                  <span className="font-mono text-[12px] tabular">{item.touchesPerWeek}</span>
                </Td>
                <Td>
                  <span
                    className={`font-mono text-[12px] tabular ${item.pendingApprovalCount > 3 ? "text-warning font-semibold" : ""}`}
                  >
                    {item.pendingApprovalCount}
                  </span>
                </Td>
                <Td>
                  <HealthPill kind={health} />
                </Td>
                <Td>
                  <Link href={viewHref} className="text-[11px] font-medium text-muted-foreground hover:text-primary">
                    View
                  </Link>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="border-b border-border px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="border-b border-border/50 px-3 py-3.5 align-middle text-[13px] last:text-right">
      {children}
    </td>
  );
}

function CapacityBar({ pct }: { pct: number }) {
  const tone = pct > 105 ? "warn" : pct < 50 ? "crit" : "ok";
  const fillColor = tone === "warn" ? "hsl(var(--warning))" : tone === "crit" ? "hsl(var(--critical))" : "hsl(var(--primary))";
  const valueColor = tone === "warn" ? "text-warning" : tone === "crit" ? "text-critical" : "";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-[3px] bg-muted">
        <span
          className="block h-full rounded-[3px]"
          style={{ width: `${Math.min(100, pct)}%`, background: fillColor }}
        />
      </span>
      <span className={`font-mono text-[11px] font-semibold tabular ${valueColor}`}>{pct}%</span>
    </span>
  );
}

function HealthPill({ kind }: { kind: "good" | "watch" | "behind" }) {
  const map = {
    good: { cls: "bg-primary-soft text-primary border-primary/30", label: "On track" },
    watch: { cls: "bg-[hsl(var(--brand-gold)/0.22)] text-[hsl(var(--brand-navy))] border-[hsl(var(--brand-gold)/0.45)]", label: "Watch" },
    behind: { cls: "bg-[hsl(var(--brand-navy))] text-[hsl(var(--brand-offwhite))] border-[hsl(var(--brand-navy))]", label: "Behind" }
  } as const;
  const { cls, label } = map[kind];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}

/* ============================== Risk drift roll-up ============================== */

function RiskDriftCard({ customers }: { customers: CustomerProfile[] }) {
  // Real derivations from customer fields: no tag proxies. Each label
  // describes exactly the rule it computes.
  const mismatch = customers.filter((c) => c.tags.includes("RiskMismatch"));
  const suitabilityExpired = customers.filter((c) => {
    const days = daysUntil(c.suitabilityExpiresAt);
    return days !== undefined && days < 0;
  });
  const reviewOverdue = customers.filter((c) => {
    const days = daysUntil(c.nextReviewDate);
    return days !== undefined && days < 0;
  });
  const kneeBlocked = customers.filter(
    (c) => c.knowledgeAssessmentStatus === "Expired" || c.knowledgeAssessmentStatus === "Pending"
  );

  const previewNames = (list: CustomerProfile[]) =>
    list
      .slice(0, 3)
      .map((c) => c.name)
      .join(" / ");

  const clientFileReview = uniqueCustomers([...suitabilityExpired, ...kneeBlocked]);
  const directHref = (customer: CustomerProfile | undefined, tab: "alignment" | "activity") =>
    customer ? `/customers/${customer.customerId}?tab=${tab}&review=manager` : "#risk-review";
  const rows = [
    {
      title: "Portfolio drift review",
      sub: previewNames(mismatch),
      count: mismatch.length,
      reviewNow: Math.min(8, mismatch.length),
      tone: "critical" as const,
      href: directHref(mismatch[0], "alignment"),
      cta: "Open case"
    },
    {
      title: "Client file review",
      sub: previewNames(clientFileReview) || "-",
      count: clientFileReview.length,
      reviewNow: Math.min(10, clientFileReview.length),
      tone: "warning" as const,
      href: directHref(clientFileReview[0], "alignment"),
      cta: "Open file"
    },
    {
      title: "Review date overdue",
      sub: previewNames(reviewOverdue) || "-",
      count: reviewOverdue.length,
      reviewNow: Math.min(8, reviewOverdue.length),
      tone: "warning" as const,
      href: directHref(reviewOverdue[0], "activity"),
      cta: "Open review"
    }
  ];
  const reviewBatch = rows.reduce((acc, row) => acc + row.reviewNow, 0);

  return (
    <div id="risk-review" className="rounded-[16px] border border-border bg-card p-6 shadow-soft">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight">Risk drift across the team</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Review batch only. Full population remains visible in Client Book.
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {reviewBatch} to review first
        </span>
      </header>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.title}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3.5 rounded-[10px] border border-border/50 bg-muted/40 px-3.5 py-3"
          >
            <div className="min-w-0">
              <div className="text-[13px] font-medium">{row.title}</div>
              {row.sub ? (
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.sub}</div>
              ) : null}
            </div>
            <div
              className={`font-display min-w-[36px] text-right text-[18px] font-semibold tabular ${
                row.tone === "critical" ? "text-critical" : "text-warning"
              }`}
            >
              {row.reviewNow}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">/ {row.count}</span>
            </div>
            <Link
              href={row.href}
              className="rounded-[8px] border border-border-strong bg-card px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:border-primary hover:text-primary"
            >
              {row.cta}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

function uniqueCustomers(customers: CustomerProfile[]) {
  return [...new Map(customers.map((customer) => [customer.customerId, customer])).values()];
}

/* ============================== Compliance hygiene ============================== */

function ComplianceHygieneCard({ hygiene }: { hygiene: ReturnType<typeof getComplianceHygiene> }) {
  return (
    <div id="compliance-hygiene" className="rounded-[16px] border border-border bg-card p-6 shadow-soft">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight">Compliance hygiene</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Three signals a head of wealth typically asks first
          </p>
        </div>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
          team-wide
        </span>
      </header>
      <div className="grid gap-3 md:grid-cols-3">
        <HygieneTile
          icon={<FileWarning className="h-3.5 w-3.5" />}
          label="Drafts rejected"
          value={`${hygiene.draftsRejectedRate}%`}
          hint={`${hygiene.draftsTouched} drafts touched today / >= 20% threshold`}
          warn={hygiene.draftsRejectedRate >= 20}
        />
        <HygieneTile
          icon={<ClockAlert className="h-3.5 w-3.5" />}
          label="Suitability queue"
          value={String(hygiene.suitabilityExpiring)}
          hint="expiring within 30d or already expired"
          warn={hygiene.suitabilityExpiring > 30}
        />
        <HygieneTile
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
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
      className="rounded-[12px] border p-4"
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

/* ============================== Approval queue (right) ============================== */

function ApprovalQueueCard({
  queue,
  rms,
  runs,
  customerById,
  rmById
}: {
  queue: AuditEvent[];
  customers: CustomerProfile[];
  rms: RMUser[];
  runs: AgentRun[];
  customerById: Map<string, CustomerProfile>;
  rmById: Map<string, RMUser>;
}) {
  void rms;
  const runById = new Map(runs.map((run) => [run.runId, run]));
  return (
    <div className="rounded-[16px] border border-border bg-card p-6 shadow-soft">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold tracking-tight">Draft approval queue</h3>
          <span
            className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: "hsl(var(--warning) / 0.14)",
              color: "hsl(var(--warning))",
              borderColor: "hsl(var(--warning) / 0.3)"
            }}
          >
            {queue.length} pending
          </span>
        </div>
        <Link href="#approval-queue" className="text-[11px] font-medium text-muted-foreground hover:text-primary">
          View all
        </Link>
      </header>
      <div className="flex flex-col gap-2">
        {queue.slice(0, 5).map((event) => {
          const customer = event.customerId ? customerById.get(event.customerId) : undefined;
          const actor = rmById.get(event.actorId);
          const run = event.runId ? runById.get(event.runId) : undefined;
          const draft = getDraftReviewSummary(run, event);
          const accent =
            actor?.role === "Junior" ? "role-junior" : actor?.role === "Manager" ? "role-manager" : "role-mid";
          const initials = (actor?.name ?? event.actorId)
            .split(/\s+/)
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <div
              key={event.eventId}
              className="grid grid-cols-[auto_1fr] items-start gap-3.5 rounded-[12px] border border-border bg-card p-4"
            >
              <div
                className="grid h-9 w-9 place-items-center rounded-[10px] border text-[12px] font-semibold"
                style={{
                  background: `hsl(var(--${accent}) / 0.15)`,
                  color: `hsl(var(--${accent}))`,
                  borderColor: `hsl(var(--${accent}) / 0.3)`
                }}
              >
                {initials}
              </div>
              <div>
                <div className="text-[13px] font-semibold leading-tight">
                  <span
                    className="mr-2 inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      background: "hsl(var(--ai-surface))",
                      color: "hsl(var(--ai-accent))",
                      borderColor: "hsl(var(--ai-border) / 0.5)"
                    }}
                  >
                    ✦
                  </span>
                  {draft.channelLabel} draft - {draft.title}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {customer?.name ?? "Team item"} / {actor?.name ?? event.actorRole} / {draft.wordCount} words /{" "}
                  {draft.guardLabel} / {event.timestamp.slice(11, 16)}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <ApprovalTransitionControls compact initialState={draft.runState} runId={event.runId} />
                  <Link
                    href={customer ? approvalHref(customer, event, "approval") : "#approval-queue"}
                    className="rounded-[8px] border border-border-strong bg-card px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted"
                  >
                    AI trace review
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
        {queue.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border bg-card px-4 py-6 text-center text-[12px] text-muted-foreground">
            No drafts pending approval.
          </div>
        ) : null}
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

/* ============================== permission guard ============================== */

function PermissionRequired({ accountName, role }: { accountName: string; role: string }) {
  return (
    <main className="space-y-5">
      <div className="rounded-[16px] border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-[24px] font-medium tracking-tight">Access Restricted</h2>
        <p className="mt-2 text-[13px] leading-[1.5] text-muted-foreground">
          {accountName} is signed in as {role}. Management is restricted to the management account because it includes
          team visibility, assignment planning, approval queues, and audit inspection.
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            href="/workspace"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border-strong bg-card px-3 py-2 text-[12px] font-medium hover:border-primary hover:text-primary"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Back to Workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
