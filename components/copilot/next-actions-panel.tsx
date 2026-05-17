"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, MessageSquareText, PhoneCall, RotateCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface NextActionItem {
  id: string;
  label: string;
  hint: string;
  reason: string;
  executeLabel: string;
  channel: "call" | "email" | "whatsapp" | "approval" | "review";
  requiredApproval?: "none" | "rm-approval" | "manager-approval";
  talkingPointId?: string;
  talkingPointTitle?: string;
}

const iconByChannel = {
  call: PhoneCall,
  email: Mail,
  whatsapp: MessageSquareText,
  approval: ShieldCheck,
  review: RotateCw
};

export function NextActionsPanel({
  actions,
  canExecute = true,
  customerId
}: {
  actions: NextActionItem[];
  canExecute?: boolean;
  customerId?: string;
}) {
  const [liveActions, setLiveActions] = useState<NextActionItem[]>(actions);
  const [selectedId, setSelectedId] = useState(actions[0]?.id);
  const selected = liveActions.find((action) => action.id === selectedId) ?? liveActions[0];

  useEffect(() => {
    setLiveActions(actions);
    setSelectedId(actions[0]?.id);
  }, [actions]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground">
          Linked to the first three suggested talking points.
        </div>
      </div>

      <div className="grid gap-2">
        {liveActions.map((action) => {
          const Icon = iconByChannel[action.channel];
          const active = action.id === selected?.id;
          return (
            <button
              className={cn(
                "grid grid-cols-[30px_1fr_auto] items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition",
                active ? "bg-[hsl(var(--brand-gold)/0.16)]" : "bg-background/78 hover:bg-[hsl(var(--brand-gold)/0.08)]"
              )}
              key={action.id}
              onClick={() => setSelectedId(action.id)}
              style={{
                borderColor: active ? "hsl(var(--ai-accent-pink) / 0.58)" : "hsl(var(--ai-border) / 0.32)"
              }}
              type="button"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[hsl(var(--brand-gold)/0.18)] text-[hsl(var(--ai-accent-pink))]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{action.label}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {action.talkingPointTitle ? `Linked to ${action.talkingPointTitle}` : action.hint}
                </span>
              </span>
              <span className="font-mono text-[10px] uppercase text-muted-foreground">{active ? "open" : "why"}</span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="rounded-[12px] border bg-background p-3" style={{ borderColor: "hsl(var(--ai-border) / 0.42)" }}>
          <div className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "hsl(var(--ai-accent-pink))" }}>
            Why this action
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{selected.reason}</p>
          {selected.hint ? (
            <div className="mt-2 rounded-md border border-[hsl(var(--ai-border)/0.38)] bg-[hsl(var(--brand-gold)/0.10)] px-2 py-1.5 text-[11px] leading-5 text-muted-foreground">
              {selected.hint}
            </div>
          ) : null}
          {selected.requiredApproval && selected.requiredApproval !== "none" ? (
            <div className="mt-2 font-mono text-[10px] uppercase text-muted-foreground">
              approval {selected.requiredApproval}
            </div>
          ) : selected.channel === "email" || selected.channel === "whatsapp" || selected.channel === "call" ? (
            <div className="mt-2 font-mono text-[10px] uppercase text-muted-foreground">
              draft approval happens after execution
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canExecute ? (
              <Link
                className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                href={makeActionHref(customerId, selected)}
              >
                {selected.executeLabel}
              </Link>
            ) : (
              <span className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-muted px-3 text-sm font-medium text-muted-foreground">
                View-only
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {canExecute ? "Opens Your Beacon with this action as context." : "Only the owning RM can start client-touch actions."}
            </span>
          </div>
        </div>
      ) : null}

    </div>
  );
}

function executeLabelForChannel(channel: NextActionItem["channel"]) {
  if (channel === "call") return "Open call opener";
  if (channel === "email") return "Open email draft";
  if (channel === "whatsapp") return "Open WhatsApp opener";
  if (channel === "approval") return "Open approval checklist";
  return "Open review task";
}

function makeActionHref(customerId: string | undefined, action: NextActionItem) {
  if (!customerId) return "#";
  const module = action.channel === "approval" || action.channel === "review" ? "term_explainer" : "draft_assist";
  const params = new URLSearchParams({
    copilot: module,
    copilotCustomerId: customerId,
    copilotIntent: `${action.label}. ${action.reason}`
  });
  if (module === "draft_assist") {
    params.set("copilotChannel", action.channel === "call" ? "call_script" : action.channel);
    if (action.channel === "email" && action.id.includes("portfolio")) {
      params.set("copilotFormat", "formal_note");
    } else if (action.channel === "call") {
      params.set("copilotFormat", "phone_opener");
    } else {
      params.set("copilotFormat", "concise_touch");
    }
  }
  return `/customers/${customerId}?${params.toString()}`;
}
