"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Check, Eye, Moon, ShieldCheck, Sun, Users } from "lucide-react";
import { useTheme } from "next-themes";
import { demoAccounts, getRoleLabel, type DemoAccount } from "@/lib/auth/accounts";

type RoleStats = {
  directBook: string;
  visibleScope: string;
  approvalControl: string;
  authority: string;
};

const roleStats: Record<string, RoleStats> = {
  rm_junior_01: {
    directBook: "77 owned clients",
    visibleScope: "My book only",
    approvalControl: "Draft review required",
    authority: "Prepare briefs and drafts inside assigned book; every client-facing draft needs manager review."
  },
  rm_mid_01: {
    directBook: "296 owned clients",
    visibleScope: "My book only",
    approvalControl: "Routine self-approval",
    authority: "Prepare, prioritize, draft and explicitly self-approve routine follow-up inside the direct book."
  },
  rm_manager_01: {
    directBook: "222 owned clients",
    visibleScope: "595 team visible",
    approvalControl: "Team approvals and audit",
    authority: "Govern coverage, assignment, approvals, compliance hygiene and audit trail."
  }
};

export function LoginPanel() {
  const [selectedRmId, setSelectedRmId] = useState(demoAccounts[1].rmId);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const selected = useMemo(
    () => demoAccounts.find((account) => account.rmId === selectedRmId) ?? demoAccounts[1],
    [selectedRmId]
  );

  async function handleLogin() {
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rmId: selected.rmId })
      });
      if (!response.ok) {
        setLoginError("Session could not be started.");
        setIsLoggingIn(false);
        return;
      }
    } catch {
      setLoginError("Session could not be started.");
      setIsLoggingIn(false);
      return;
    }

    window.setTimeout(() => {
      window.location.href = selected.recommendedPath;
    }, 280);
  }

  return (
    <main className="brand-surface relative min-h-screen overflow-hidden text-foreground">
      <div aria-hidden className="brand-grid pointer-events-none absolute inset-0 opacity-30" />
      <div aria-hidden className="brand-beam-surface pointer-events-none absolute inset-y-0 left-0 w-[58vw] opacity-70" />
      <div className="absolute right-5 top-5 z-20 md:right-8 md:top-8">
        <LoginThemeToggle />
      </div>

      <section className="relative z-10 grid min-h-screen items-center gap-8 px-5 py-8 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,462px)] lg:px-14">
        <div className="relative flex min-h-[500px] overflow-hidden py-8 lg:min-h-[700px]">
          <div className="pointer-events-none absolute bottom-[clamp(-40px,-3vh,6px)] left-[-18vw] z-0 hidden w-[min(63vw,1060px)] lg:block xl:w-[min(68vw,1160px)]">
            <img
              alt="Beacon"
              className="h-auto w-full max-w-none object-contain opacity-[0.34] drop-shadow-[0_28px_70px_hsl(var(--brand-navy)/0.10)] dark:hidden"
              src="/brand/beacon-mark-primary-transparent.png"
            />
            <img
              alt=""
              className="hidden h-auto w-full max-w-none object-contain opacity-[0.20] drop-shadow-[0_0_34px_hsl(var(--brand-gold)/0.12)] dark:block"
              src="/brand/beacon-mark-primary-dark.png"
            />
          </div>
          <div className="relative z-10 flex w-full flex-col justify-center px-2 lg:pl-[clamp(260px,28vw,470px)] lg:pr-8 xl:pl-[clamp(300px,31vw,540px)]">
            <h1 className="font-display-tight max-w-[540px] text-[44px] font-medium leading-[0.98] md:text-[64px] lg:text-[clamp(58px,5.1vw,86px)] xl:text-[clamp(68px,5.6vw,104px)]">
              <span className="block text-left text-[hsl(var(--brand-navy))] dark:text-[hsl(var(--brand-offwhite))]">
                Signal What
              </span>
              <span
                className="block text-left"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(var(--ai-accent-pink)) 0%, hsl(var(--brand-gold)) 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent"
                }}
              >
                Matters
              </span>
            </h1>
          </div>
        </div>

        <aside className="relative ml-auto w-full max-w-[462px]">
          <div className="relative z-10 w-full rounded-[28px] border border-border/70 bg-card/88 p-5 shadow-lift backdrop-blur-xl md:p-7">
            <div className="mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-display-tight text-[24px] font-medium leading-none md:text-[32px]">
                    Dyna Beacon
                  </div>
                  <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
                    Select one account. Authority expands from Junior to Manager.
                  </div>
                </div>
                <span className="rounded-full border border-border bg-background/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  v1.2 demo
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {demoAccounts.map((account) => (
                <div key={account.rmId}>
                  <RoleOption
                    account={account}
                    active={account.rmId === selected.rmId}
                    onSelect={() => setSelectedRmId(account.rmId)}
                  />
                  {account.rmId === selected.rmId ? <ActiveRoleDetails account={account} /> : null}
                </div>
              ))}
            </div>

            <button
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[14px] px-5 py-3.5 text-sm font-semibold transition hover:-translate-y-px disabled:opacity-70"
              disabled={isLoggingIn}
              onClick={handleLogin}
              style={{
                background: `hsl(var(--${selected.accent}))`,
                // All three role fills are now in the blue ramp — offwhite text
                // reads on all of them. Locked to brand-offwhite, not theme.
                color: "hsl(var(--brand-offwhite))",
                boxShadow: `0 1px 0 hsl(var(--${selected.accent}) / 0.55) inset, 0 16px 28px -14px hsl(var(--${selected.accent}) / 0.56)`
              }}
              type="button"
            >
              {isLoggingIn ? "Signing in..." : "Enter workspace"}
              <ArrowRight className="h-4 w-4" />
            </button>
            {loginError ? (
              <p className="mt-3 rounded-[10px] border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] leading-5 text-destructive">
                {loginError}
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}

/**
 * Compact role option — single line, name + role badge + check. The duplicate
 * subtitle line ("owned clients · My book only") was removed because the
 * same info is shown in the active details panel below; redundancy gone.
 *
 * Color foregrounds are computed against the actual fill (not theme tokens)
 * so dark-mode + dark-navy bg always renders text in offwhite. Fixes the
 * "Sofia Tan invisible on Manager card" bug from the screenshot.
 */
function RoleOption({ account, active, onSelect }: { account: DemoAccount; active: boolean; onSelect: () => void }) {
  // All three role accents are now blue-family (sky → brand → navy).
  // Foreground locks to brand-offwhite for every active fill regardless
  // of theme — fixes the dark-mode contrast bug.
  const activeFg = "hsl(var(--brand-offwhite))";
  return (
    <button
      className="grid w-full grid-cols-[1fr_auto] items-center gap-2.5 overflow-hidden rounded-[12px] border px-3.5 py-2.5 text-left transition hover:-translate-y-px"
      onClick={onSelect}
      style={{
        background: active
          ? `linear-gradient(135deg, hsl(var(--${account.accent})) 0%, hsl(var(--${account.accent}) / 0.82) 100%)`
          : `linear-gradient(135deg, hsl(var(--${account.accent}) / 0.06), hsl(var(--card)) 78%)`,
        borderColor: active ? `hsl(var(--${account.accent}) / 0.5)` : "hsl(var(--border))",
        boxShadow: active ? `0 0 0 3px hsl(var(--${account.accent}) / 0.10)` : undefined
      }}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className="font-display truncate text-[16px] font-semibold leading-none"
          style={{ color: active ? activeFg : "hsl(var(--foreground))" }}
        >
          {account.name}
        </span>
        <span
          className="shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
          style={{
            background: active
              ? "hsl(var(--brand-offwhite) / 0.16)"
              : `hsl(var(--${account.accent}) / 0.10)`,
            borderColor: active
              ? "hsl(var(--brand-offwhite) / 0.28)"
              : `hsl(var(--${account.accent}) / 0.30)`,
            color: active ? activeFg : `hsl(var(--${account.accent}))`
          }}
        >
          {getRoleLabel(account.role)}
        </span>
      </span>
      <span
        className="grid h-[20px] w-[20px] place-items-center rounded-full border"
        style={{
          backgroundColor: active
            ? "hsl(var(--brand-offwhite) / 0.14)"
            : "transparent",
          borderColor: active
            ? "hsl(var(--brand-offwhite) / 0.55)"
            : "hsl(var(--border-strong))",
          color: active ? activeFg : "transparent"
        }}
      >
        <Check className="h-3 w-3" strokeWidth={2.5} />
      </span>
    </button>
  );
}

/**
 * Active-role details — redesigned as a compact two-row layout:
 *   row 1: 3 inline scope items separated by hairlines (Clients · Visible · Approval)
 *   row 2: short authority paragraph
 * No more 3 colored tiles — the per-tile gold/navy/blue backgrounds added
 * color noise that competes with AI surfaces. One subtle bordered card with
 * key/value pairs reads cleaner.
 *
 * Manager renders on a supervisory blue fill; foreground forced to brand-offwhite
 * so it's always readable regardless of theme.
 */
function ActiveRoleDetails({ account }: { account: DemoAccount }) {
  const stats = roleStats[account.rmId];
  const dark = account.role === "Manager";
  const fg = dark ? "hsl(var(--brand-offwhite))" : "hsl(var(--foreground))";
  const fgMuted = dark ? "hsl(var(--brand-offwhite) / 0.62)" : "hsl(var(--muted-foreground))";
  const divider = dark ? "hsl(var(--brand-offwhite) / 0.16)" : "hsl(var(--border))";
  return (
    <section
      className="mt-2 overflow-hidden rounded-[14px] border"
      style={{
        background: dark ? "hsl(var(--role-manager) / 0.94)" : "hsl(var(--card-soft) / 0.7)",
        borderColor: dark ? "hsl(var(--brand-blue) / 0.32)" : "hsl(var(--border))"
      }}
    >
      {/* Row 1 — three scope items in one line */}
      <div className="grid grid-cols-3 divide-x" style={{ borderColor: divider, color: fg }}>
        <ScopeItem icon={<Users className="h-3 w-3" />} label="Clients" value={stats.directBook} fg={fg} fgMuted={fgMuted} divider={divider} />
        <ScopeItem icon={<Eye className="h-3 w-3" />} label="Visible" value={stats.visibleScope} fg={fg} fgMuted={fgMuted} divider={divider} />
        <ScopeItem icon={<ShieldCheck className="h-3 w-3" />} label="Approval" value={stats.approvalControl} fg={fg} fgMuted={fgMuted} divider={divider} />
      </div>

      {/* Row 2 — authority paragraph */}
      <div
        className="border-t px-3.5 py-2.5 text-[11px] leading-[1.5]"
        style={{ borderColor: divider, color: dark ? "hsl(var(--brand-offwhite) / 0.78)" : "hsl(var(--foreground) / 0.78)" }}
      >
        {stats.authority}
      </div>
    </section>
  );
}

function ScopeItem({
  icon,
  label,
  value,
  fg,
  fgMuted,
  divider
}: {
  icon: ReactNode;
  label: string;
  value: string;
  fg: string;
  fgMuted: string;
  divider: string;
}) {
  void divider;
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-1.5" style={{ color: fgMuted }}>
        {icon}
        <span className="text-[9px] font-medium uppercase tracking-[0.08em]">{label}</span>
      </div>
      <div className="mt-1.5 text-[12px] font-semibold leading-tight" style={{ color: fg }}>
        {value}
      </div>
    </div>
  );
}

function LoginThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && theme === "dark";
  return (
    <button
      aria-label="Toggle theme"
      className="grid h-10 w-10 place-items-center rounded-full border border-border/70 bg-card/72 text-muted-foreground shadow-soft backdrop-blur transition hover:bg-card hover:text-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      type="button"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
