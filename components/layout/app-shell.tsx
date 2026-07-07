"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, Moon, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";
import { SessionSwitcher } from "@/components/auth/session-switcher";
import { CopilotChatLauncher } from "@/components/copilot/copilot-chat-launcher";
import type { DemoAccount } from "@/lib/auth/accounts";

type NavItem = {
  href: string;
  label: string;
  managerOnly?: boolean;
};

const navItems: NavItem[] = [
  { href: "/workspace", label: "Workspace" },
  { href: "/customers", label: "Client Book" },
  { href: "/manager", label: "Management", managerOnly: true }
];

export function AppShell({ account, children }: { account?: DemoAccount; children: React.ReactNode }) {
  const pathname = usePathname();
  const isManager = account?.role === "Manager";

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {pathname === "/login" || pathname === "/access" ? (
        <>{children}</>
      ) : (
        <div
          className="relative min-h-screen overflow-hidden bg-background"
          style={
            isManager
              ? {
                  background:
                    "linear-gradient(180deg, hsl(var(--role-manager) / 0.16) 0%, hsl(var(--background)) 320px)"
                }
              : undefined
          }
        >
          {/* Brand decoration layers — north-star pattern (gold dots),
              top-right gold light beam, bottom blue wave. Together they
              echo the three Beacon mark elements without competing with
              content. */}
          <div
            aria-hidden
            className="brand-north-star-pattern pointer-events-none absolute inset-0 z-0 opacity-[0.45]"
            style={{
              WebkitMaskImage:
                "radial-gradient(ellipse 90% 60% at 50% 30%, #000 0%, transparent 80%)",
              maskImage:
                "radial-gradient(ellipse 90% 60% at 50% 30%, #000 0%, transparent 80%)"
            }}
          />
          <div
            aria-hidden
            className="brand-light-beam pointer-events-none absolute inset-x-0 top-0 z-0 h-[420px]"
          />
          <div
            aria-hidden
            className="brand-wave pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[80px] opacity-90"
          />
          <header
            className={`sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md ${
              isManager ? "border-[hsl(var(--role-manager)/0.28)] shadow-[0_8px_30px_-24px_hsl(var(--role-manager)/0.50)]" : "border-border/60"
            }`}
          >
            <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-6 px-7">
              <Link
                aria-label="Dyna Beacon home"
                className="flex items-center gap-2.5 transition hover:-translate-y-px"
                href="/workspace"
              >
                <span className="relative grid h-12 w-12 place-items-center">
                  <img
                    alt="Beacon"
                    className="h-12 w-12 object-contain drop-shadow-[0_8px_18px_hsl(var(--brand-navy)/0.12)] dark:hidden"
                    src="/brand/beacon-mark-compact-transparent.png"
                  />
                  <img
                    alt="Beacon"
                    className="hidden h-12 w-12 object-contain drop-shadow-[0_0_18px_hsl(var(--brand-gold)/0.18)] dark:block"
                    src="/brand/beacon-mark-compact-dark.png"
                  />
                </span>
                <span className="font-display text-[16px] font-semibold tracking-tight">
                  Dyna Beacon
                </span>
              </Link>
              {/* Pill nav (centered) */}
              <nav className="hidden items-center gap-1 rounded-full border border-border/60 bg-muted/50 p-1 md:flex">
                {navItems.map((item) => {
                  const locked = item.managerOnly && !isManager;
                  return (
                    <NavLink key={item.href} href={item.href} label={item.label} locked={locked} />
                  );
                })}
              </nav>

              {/* Right: account + theme */}
              <div className="flex items-center justify-end gap-2">
                {account ? <SessionSwitcher account={account} /> : null}
                <ThemeToggle />
              </div>
            </div>
          </header>
          <div className="relative z-10 mx-auto max-w-7xl px-7 py-8 pb-24">{children}</div>
          <Suspense fallback={null}>
            <CopilotChatLauncher />
          </Suspense>
        </div>
      )}
    </ThemeProvider>
  );
}

function NavLink({ href, label, locked }: { href: string; label: string; locked?: boolean }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
        active
          ? "bg-card text-foreground shadow-soft"
          : locked
            ? "text-muted-foreground/70 hover:bg-card/60"
            : "text-muted-foreground hover:bg-card hover:text-foreground"
      }`}
      href={href}
      title={locked ? "Restricted management area" : undefined}
    >
      {locked ? <Lock className="h-3 w-3" aria-hidden /> : null}
      {label}
    </Link>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      aria-label="Toggle theme"
      className="grid h-[34px] w-[34px] place-items-center rounded-full border border-border/60 bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      type="button"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
