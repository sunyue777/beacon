/**
 * Alignment tab visual blocks: profile-vs-actual risk gauge, allocation drift,
 * liquidity health, concentration signals, and AI factor breakdown.
 */
import type { ReactNode } from "react";
import type { CustomerProfile, Holding, Product } from "@/lib/repo/types";
import { getRiskAlignment, type ComplianceState } from "@/lib/domain/risk-compliance";

export function RiskAlignmentCard({
  customer,
  holdings,
  products,
  reviewDisclosure
}: {
  customer: CustomerProfile;
  holdings: Holding[];
  products: Product[];
  reviewDisclosure?: ReactNode;
}) {
  const alignment = getRiskAlignment(customer, holdings, products);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[16px] border border-border bg-card px-7 py-7 shadow-soft">
        <div
          className="-mx-7 -mt-7 mb-6 grid gap-5 border-b border-border/65 px-7 py-6 md:grid-cols-[1fr_auto]"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--brand-blue) / 0.08), hsl(var(--brand-navy) / 0.04))"
          }}
        >
          <div>
            <h2 className="font-display text-[22px] font-medium leading-[1.2] tracking-tight">
              Portfolio Drift
            </h2>
            <p className="mt-1 max-w-[520px] text-[13px] leading-[1.5] text-muted-foreground">
              Gauge compares {customer.name.split(" ")[0]}&apos;s stated profile risk score with the actual live portfolio score.
            </p>
          </div>
          <div className="text-right">
            <RiskStateBadge actual={alignment.actualScore} profile={alignment.profileScore} state={alignment.state} />
            {actualExceedsProfile(alignment.actualScore, alignment.profileScore) && alignment.driftDays > 0 ? (
              <div className="mt-2 text-[12px] text-muted-foreground">
                Drift detected {alignment.driftDays} days ago - {alignment.driftDays > 21 ? "widening" : "monitoring"}
              </div>
            ) : null}
          </div>
        </div>

        <RiskGauge profile={alignment.profileScore} actual={alignment.actualScore} gap={alignment.gap} />
        {reviewDisclosure ? <div className="mt-5">{reviewDisclosure}</div> : null}
      </section>

      <section className="overflow-hidden rounded-[16px] border border-border bg-card px-7 py-7 shadow-soft">
        <div
          className="-mx-7 -mt-7 mb-6 border-b border-border/65 px-7 py-6"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--brand-blue) / 0.08), hsl(var(--brand-navy) / 0.04))"
          }}
        >
          <h2 className="font-display text-[22px] font-medium leading-[1.2] tracking-tight">
            Allocation Drift
          </h2>
          <p className="mt-1 max-w-[520px] text-[13px] leading-[1.5] text-muted-foreground">
            Target versus actual allocation, with red bars where a bucket has moved beyond tolerance.
          </p>
        </div>
        <div>
          <AllocationBars rows={alignment.allocation} />
        </div>
      </section>

      <section className="overflow-hidden rounded-[16px] border border-border bg-card px-7 py-7 shadow-soft">
        <div
          className="-mx-7 -mt-7 mb-6 border-b border-border/65 px-7 py-6"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--brand-blue) / 0.08), hsl(var(--brand-navy) / 0.04))"
          }}
        >
          <h2 className="font-display text-[22px] font-medium leading-[1.2] tracking-tight">
            Liquidity &amp; Concentration Health
          </h2>
          <p className="mt-1 max-w-[560px] text-[13px] leading-[1.5] text-muted-foreground">
            Checks whether the client can reasonably access cash if needed, and whether too much exposure sits in a small number of products, sectors, or illiquid holdings.
          </p>
        </div>
        <div className="grid items-start gap-7 lg:grid-cols-[300px_1fr]">
          <LiquidityDonut liquidity={alignment.liquidity} />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[10px] border border-primary/20 bg-primary-soft/60 p-3.5 md:col-span-2">
              <div className="text-[12px] font-semibold text-primary">How to read this</div>
              <p className="mt-1 text-[11px] leading-[1.45] text-muted-foreground">
                Liquid assets can be sold or used quickly. Semi-liquid assets may need time or notice. Illiquid assets are harder to exit. Concentration checks whether one holding or bucket is carrying too much of the portfolio.
              </p>
            </div>
            {alignment.factors.map((factor) => (
              <div
                className="rounded-[10px] border p-3.5"
                key={factor.name}
                style={{
                  background:
                    "linear-gradient(135deg, hsl(var(--ai-surface) / 0.5), hsl(var(--ai-surface-2) / 0.4))",
                  borderColor: "hsl(var(--ai-border) / 0.4)"
                }}
              >
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium leading-[1.2]" style={{ color: "hsl(var(--ai-foreground))" }}>
                    {factor.name}
                  </span>
                  <span className="font-mono text-[11px] font-semibold tabular" style={{ color: "hsl(var(--ai-accent))" }}>
                    +{factor.weight} pts
                  </span>
                </div>
                <div className="text-[11px] leading-[1.4]" style={{ color: "hsl(var(--ai-foreground) / 0.7)" }}>
                  {factor.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function RiskStateBadge({ actual, profile, state }: { actual: number; profile: number; state: ComplianceState }) {
  const hotterThanProfile = actual > profile;
  const cls =
    hotterThanProfile
      ? "bg-critical/10 text-critical border-critical/30"
      : "bg-primary-soft text-primary border-primary/30";
  const label =
    hotterThanProfile && state === "Block"
      ? "Material drift"
      : hotterThanProfile && state === "Watch"
        ? "Drift detected"
        : "Aligned";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${cls}`}
    >
      {label}
    </span>
  );
}

function actualExceedsProfile(actual: number, profile: number) {
  return actual > profile;
}

function RiskGauge({ profile, actual, gap }: { profile: number; actual: number; gap: number }) {
  const profilePct = Math.max(2, Math.min(98, ((profile - 1) / 8) * 100));
  const actualPct = Math.max(2, Math.min(98, ((actual - 1) / 8) * 100));
  const hotterThanProfile = actual > profile;
  const actualTone = hotterThanProfile ? "critical" : "primary";
  const gapLabel = hotterThanProfile ? "actual exceeds profile" : profile === actual ? "aligned" : "actual below profile";

  return (
    <div>
      <div className="grid grid-cols-[110px_1fr_110px] items-center gap-3.5">
        <div className="text-[11px] font-medium tracking-[0.02em] text-muted-foreground">Conservative</div>

        <div
          className="relative h-9 rounded-[10px] border"
          style={{
            borderColor: "hsl(var(--border) / 0.5)",
            background:
              "linear-gradient(90deg, hsl(var(--primary) / 0.12) 0%, hsl(var(--brand-navy) / 0.10) 58%, hsl(var(--critical) / 0.12) 100%)"
          }}
        >
          <div className="absolute inset-0 grid grid-cols-5">
            {[1, 3, 5, 7, 9].map((tick, index) => (
              <span
                className={`flex items-end justify-center pb-0.5 font-mono text-[9px] tabular ${
                  index < 4 ? "border-r border-dashed border-border" : ""
                }`}
                key={tick}
                style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}
              >
                {tick}
              </span>
            ))}
          </div>

          <div
            className="absolute -top-1.5 -bottom-1.5 w-1 rounded-[2px]"
            style={{
              left: `calc(${profilePct}% - 2px)`,
              background: "hsl(var(--primary))",
              boxShadow: "0 0 0 3px hsl(var(--primary) / 0.18)"
            }}
          >
            <div
              className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold"
              style={{
                top: "-22px",
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))"
              }}
            >
              Profile - {profile.toFixed(1)}
            </div>
          </div>

          <div
            className="absolute -top-1.5 -bottom-1.5 w-1 rounded-[2px]"
            style={{
              left: `calc(${actualPct}% - 2px)`,
              background: `hsl(var(--${actualTone}))`,
              boxShadow: `0 0 0 3px hsl(var(--${actualTone}) / 0.2)`
            }}
          >
            <div
              className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold text-white"
              style={{
                bottom: "-22px",
                background: `hsl(var(--${actualTone}))`
              }}
            >
              Actual - {actual.toFixed(1)}
            </div>
          </div>
        </div>

        <div className="text-right text-[11px] font-medium tracking-[0.02em] text-muted-foreground">Aggressive</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-[10px] bg-muted/50 px-3.5 py-3 text-[12px] leading-[1.3] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "hsl(var(--primary))" }} />
          Profile risk score
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(var(--${actualTone}))` }} />
          Actual portfolio score
        </span>
        <span className="ml-auto">
          Gap:{" "}
          <strong className={hotterThanProfile ? "text-critical" : "text-primary"}>
            {gap >= 0 ? "+" : ""}
            {gap.toFixed(1)} points
          </strong>{" "}
          {gapLabel}
        </span>
      </div>
    </div>
  );
}

function AllocationBars({ rows }: { rows: ReturnType<typeof getRiskAlignment>["allocation"] }) {
  return (
    <div>
      <div className="mb-3.5 flex items-center justify-between">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          Allocation vs target
        </h3>
        <span className="text-[11px] text-muted-foreground">Target band +/-5%</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div className="grid grid-cols-[130px_1fr_auto] items-center gap-3.5 py-1" key={row.bucket}>
            <div className="text-[12px] font-medium leading-[1.2]">{row.bucket}</div>
            <div className="relative h-6 overflow-hidden rounded-[6px] bg-muted/60">
              <div
                className="absolute left-0 top-0 bottom-0"
                style={{
                  width: `${row.targetPct}%`,
                  background: "hsl(var(--primary) / 0.18)",
                  borderRight: "2px solid hsl(var(--primary))"
                }}
              />
              <div
                className="absolute left-0 top-1 bottom-1 rounded-[4px]"
                style={{
                  width: `${Math.min(100, row.actualPct)}%`,
                  background: row.over ? "hsl(var(--critical))" : row.under ? "hsl(var(--warning))" : "hsl(var(--primary))"
                }}
              />
            </div>
            <div className="whitespace-nowrap font-mono text-[11px] tabular text-muted-foreground">
              {row.targetPct}% -{" "}
              <span className={`font-semibold ${row.over ? "text-critical" : row.under ? "text-warning" : "text-foreground"}`}>
                {row.actualPct}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiquidityDonut({
  liquidity
}: {
  liquidity: ReturnType<typeof getRiskAlignment>["liquidity"];
}) {
  const { liquidPct, semiPct, illiquidPct, illiquidCap } = liquidity;
  const ringSum = liquidPct + semiPct + illiquidPct || 1;
  const liquidNorm = (liquidPct / ringSum) * 100;
  const semiNorm = (semiPct / ringSum) * 100;
  const illiquidNorm = (illiquidPct / ringSum) * 100;
  const overCap = illiquidPct > illiquidCap;

  const liquidOffset = 25;
  const semiOffset = liquidOffset - liquidNorm;
  const illiquidOffset = semiOffset - semiNorm;

  return (
    <div className="flex flex-col items-center py-3">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
        Liquidity profile
      </div>
      <div className="relative h-[180px] w-[180px]">
        <svg className="h-full w-full" viewBox="0 0 36 36">
          <circle cx="18" cy="18" fill="none" r="15.915" stroke="hsl(var(--muted))" strokeWidth="3.6" />
          <circle
            cx="18"
            cy="18"
            fill="none"
            r="15.915"
            stroke="hsl(var(--brand-blue))"
            strokeDasharray={`${liquidNorm.toFixed(2)} 100`}
            strokeDashoffset={liquidOffset.toFixed(2)}
            strokeLinecap="round"
            strokeWidth="3.6"
          />
          <circle
            cx="18"
            cy="18"
            fill="none"
            r="15.915"
            stroke="hsl(var(--brand-gold))"
            strokeDasharray={`${semiNorm.toFixed(2)} 100`}
            strokeDashoffset={semiOffset.toFixed(2)}
            strokeLinecap="round"
            strokeWidth="3.6"
          />
          <circle
            cx="18"
            cy="18"
            fill="none"
            r="15.915"
            stroke={overCap ? "hsl(var(--critical))" : "hsl(var(--brand-navy))"}
            strokeDasharray={`${illiquidNorm.toFixed(2)} 100`}
            strokeDashoffset={illiquidOffset.toFixed(2)}
            strokeLinecap="round"
            strokeWidth="3.6"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className={`font-display text-[28px] font-semibold leading-none tracking-tight tabular ${overCap ? "text-critical" : ""}`}>
              {illiquidPct}
              <small className="ml-0.5 text-[13px] font-normal text-muted-foreground">%</small>
            </div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Illiquid
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid w-full grid-cols-2 gap-x-3.5 gap-y-1.5 text-[11px] leading-[1.2] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: "hsl(var(--brand-blue))" }} />
          Liquid - {liquidPct}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: "hsl(var(--brand-gold))" }} />
          Semi - {semiPct}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: overCap ? "hsl(var(--critical))" : "hsl(var(--brand-navy))" }} />
          Illiquid - {illiquidPct}%
        </span>
        <span className={`inline-flex items-center gap-1.5 ${overCap ? "text-critical" : ""}`}>
          <span
            className="h-2 w-2 rounded-[2px] border border-dashed"
            style={{ borderColor: overCap ? "hsl(var(--critical))" : "hsl(var(--muted-foreground))" }}
          />
          Cap - {illiquidCap}%
        </span>
      </div>
    </div>
  );
}
