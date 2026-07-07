"use client";

import { LogOut } from "lucide-react";
import { getRoleLabel, type DemoAccount } from "@/lib/auth/accounts";

export function SessionSwitcher({ account }: { account: DemoAccount }) {
  async function signOut() {
    window.localStorage.removeItem("beacon_rm_id");
    await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
    window.location.href = "/login";
  }

  return (
    <div className="flex items-center gap-2">
      {/* Single role-coloured account chip — combines the role label, name,
          and accent dot. Replaces the previous duplicate (white pill + colored
          chip). */}
      <span
        className="hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider md:inline-flex"
        style={{
          backgroundColor: `hsl(var(--${account.accent}) / 0.12)`,
          color: `hsl(var(--${account.accent}))`,
          borderColor: `hsl(var(--${account.accent}) / 0.32)`
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: `hsl(var(--${account.accent}))` }}
          aria-hidden
        />
        {getRoleLabel(account.role)} · {account.name}
      </span>

      <button
        aria-label="Sign out"
        className="grid h-[34px] w-[34px] place-items-center rounded-full border border-border/60 bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
        onClick={signOut}
        title="Sign out"
        type="button"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
