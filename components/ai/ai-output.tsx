"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, FileSearch, X } from "lucide-react";
import { EvidenceExportButton } from "@/components/evidence/evidence-export-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canTransitionAgentRun } from "@/lib/copilot/approval";
import { runRequiresFourEyesWaiver } from "@/lib/copilot/approval-matrix";
import { buildEvidencePack, type EvidencePackInput } from "@/lib/domain/evidence-pack";
import type { AgentRun, RMRole } from "@/lib/repo/types";
import { cn } from "@/lib/utils/cn";

export function AIOutput({
  title,
  status,
  generatedAt,
  summary,
  run,
  evidenceContext,
  viewerRmId,
  viewerRole,
  children
}: {
  title: string;
  status: string;
  generatedAt?: string;
  summary: string;
  run?: AgentRun;
  evidenceContext?: Omit<EvidencePackInput, "run" | "title">;
  viewerRmId?: string;
  viewerRole?: RMRole;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [currentRun, setCurrentRun] = useState(run);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const why = getInlineWhy(currentRun);
  const state = currentRun?.state ?? "prepared";
  const canReview = Boolean(currentRun?.runId && currentRun.approvalRequired && currentRun.approvalRequired !== "auto" && state !== "sent" && state !== "discarded");
  const activeViewerRole = viewerRole ?? currentRun?.roleAtRun;
  const activeViewerRmId = viewerRmId ?? currentRun?.rmId;
  const approvalRequirement = formatApprovalRequirement(currentRun?.approvalRequired);
  const viewerActor = activeViewerRmId && activeViewerRole ? { rmId: activeViewerRmId, role: activeViewerRole } : undefined;
  const needsFourEyesWaiver = Boolean(currentRun && viewerActor && runRequiresFourEyesWaiver(currentRun, viewerActor));
  const complianceGate = currentRun?.steps.find((step) => step.name === "Compliance gate");
  const evidencePack = currentRun
    ? buildEvidencePack({
        ...evidenceContext,
        kind: "trace",
        title,
        run: currentRun
      })
    : undefined;
  const currentRunWithState = currentRun ? { ...currentRun, state } : undefined;
  const approveCheck = currentRunWithState && viewerActor
    ? canTransitionAgentRun(currentRunWithState, "approved", viewerActor)
    : { ok: false as const, reason: "viewer not available" };
  const rejectCheck = currentRunWithState && viewerActor
    ? canTransitionAgentRun(currentRunWithState, "rejected", viewerActor)
    : { ok: false as const, reason: "viewer not available" };
  const canApprove = approveCheck.ok;
  const canReturn = rejectCheck.ok;

  useEffect(() => {
    setCurrentRun(run);
    setTransitionError(null);
  }, [run]);

  async function transitionRun(transition: "edited" | "approved" | "rejected" | "discarded" | "sent") {
    if (!currentRun?.runId) return;
    setTransitioning(transition);
    setTransitionError(null);
    const response = await fetch(`/api/copilot/runs/${encodeURIComponent(currentRun.runId)}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transition,
        note: `${title} ${transition} from AIOutput`
      })
    });
    const payload = (await response.json()) as { ok: boolean; reason?: string; output?: AgentRun };
    if (payload.ok && payload.output) {
      setCurrentRun(payload.output);
      router.refresh();
    } else {
      setTransitionError(payload.reason ?? "state transition failed");
    }
    setTransitioning(null);
  }

  async function approveAndSendRun(options: { fourEyesWaived?: boolean } = {}) {
    if (!currentRun?.runId) return;
    setTransitioning("approved");
    setTransitionError(null);
    const approved = await postRunTransition(
      currentRun.runId,
      "approved",
      options.fourEyesWaived ? `${title} approved with demo four-eyes waiver` : `${title} approved before send`,
      options
    );
    if (!approved.ok || !approved.output) {
      setTransitionError(approved.reason ?? "approval failed");
      setTransitioning(null);
      return;
    }
    setCurrentRun(approved.output);
    router.refresh();
    const sent = await postRunTransition(currentRun.runId, "sent", `${title} sent after approval`);
    if (sent.ok && sent.output) {
      setCurrentRun(sent.output);
      router.refresh();
    } else {
      setTransitionError(sent.reason ?? "send failed after approval");
    }
    setTransitioning(null);
  }

  return (
    <>
      <Card
        className="overflow-hidden border-[hsl(var(--ai-border)/0.55)]"
        style={{
          background: "linear-gradient(135deg, hsl(var(--ai-accent-pink) / 0.07), hsl(var(--brand-gold) / 0.10), hsl(var(--card)))"
        }}
      >
        <CardHeader className="space-y-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="ai-generated-mark text-sm font-semibold">
                <CardTitle>{title}</CardTitle>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <TracePill>{status}</TracePill>
              {generatedAt ? <TracePill muted>{generatedAt}</TracePill> : null}
              {currentRun?.state ? <TracePill muted>state {formatStateLabel(state)}</TracePill> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">{summary}</p>
          {children ? <div className="mt-4">{children}</div> : null}
          {canReview ? (
            <div className="mt-4 rounded-md border border-[hsl(var(--ai-border)/0.45)] bg-background/78 p-4">
              <div className="grid gap-3">
                <div>
                  <div className="text-xs font-semibold">Review-before-use</div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                    state {formatStateLabel(state)} / approval {currentRun?.approvalRequired}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {state === "rejected" ? (
                    <>
                      <StateButton tone="edit" loading={transitioning === "edited"} onClick={() => transitionRun("edited")}>
                        Mark edited & resubmit
                      </StateButton>
                      <StateButton tone="delete" loading={transitioning === "discarded"} onClick={() => transitionRun("discarded")}>
                        Delete draft
                      </StateButton>
                    </>
                  ) : null}
                  {state !== "rejected" && state !== "discarded" && state !== "sent" ? (
                    <>
                      {!canApprove ? (
                        <StateButton tone="edit" disabled={state === "approved"} loading={transitioning === "edited"} onClick={() => transitionRun("edited")}>
                          Save edits / keep in review
                        </StateButton>
                      ) : null}
                      {canApprove ? (
                        <>
                          <StateButton tone="approve" disabled={state === "approved"} loading={transitioning === "approved"} onClick={() => approveAndSendRun()}>
                            Approve & send
                          </StateButton>
                          {canReturn ? (
                            <StateButton tone="return" disabled={state === "approved"} loading={transitioning === "rejected"} onClick={() => transitionRun("rejected")}>
                              Return for edit
                            </StateButton>
                          ) : null}
                        </>
                      ) : null}
                      {needsFourEyesWaiver ? (
                        <StateButton tone="approve" disabled={state === "approved"} loading={transitioning === "approved"} onClick={() => approveAndSendRun({ fourEyesWaived: true })}>
                          Approve own draft - four-eyes waived in demo
                        </StateButton>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div
                  className="rounded-md border px-3 py-2 text-[12px] font-medium"
                  style={{
                    background: transitionError ? "hsl(var(--warning) / 0.10)" : "hsl(var(--brand-gold) / 0.14)",
                    borderColor: transitionError ? "hsl(var(--warning) / 0.35)" : "hsl(var(--brand-gold) / 0.45)",
                    color: "hsl(var(--warning))"
                  }}
                >
                  {transitionError ?? approvalRequirement}
                  {complianceGate ? " Requires suitability refresh before client-facing use." : ""}
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <FileSearch className="h-4 w-4" />
              Trace
            </Button>
          </div>
          {why ? (
            <div className="mt-3 rounded-md border border-[hsl(var(--ai-border)/0.45)] bg-background p-3 text-xs leading-5 text-muted-foreground">
              <span className="font-semibold text-foreground">Why: </span>
              {why}
            </div>
          ) : null}
          <div className="mt-4 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
            AI support is for RM productivity and comprehension. Final suitability, eligibility, approvals, and client-facing judgment remain institution-owned.
          </div>
        </CardContent>
      </Card>

      <div className={cn("fixed inset-0 z-50 transition", open ? "pointer-events-auto" : "pointer-events-none")}>
        <div className={cn("absolute inset-0 bg-foreground/30 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside
          className={cn(
            "absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card p-5 shadow-panel transition-transform",
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Trace and evidence</div>
              <h2 className="mt-1 text-xl font-semibold">{title}</h2>
            </div>
            <Button aria-label="Close trace" variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <TraceRow label="Mode" value={currentRun?.fallbackMode ? "Fallback" : "Live or local"} />
              <TraceRow label="Run ID" value={currentRun?.runId ?? "not yet persisted"} />
              <TraceRow label="Module" value={currentRun?.moduleId ?? currentRun?.channel ?? "foundation"} />
              <TraceRow label="Channel" value={currentRun?.channel ?? "foundation"} />
              <TraceRow label="Selected runtime" value={currentRun?.requestedRuntime ?? currentRun?.backend ?? "not selected"} />
              <TraceRow label="Actual backend" value={currentRun?.backend ?? "not connected"} />
              <TraceRow label="Model" value={currentRun?.model ?? "not recorded"} />
              <TraceRow label="Provider" value={currentRun?.llmProvider ?? "not recorded"} />
              <TraceRow label="Skill version" value={currentRun?.skillVersion ?? "not recorded"} />
              <TraceRow label="State" value={currentRun?.state ?? "not tracked"} />
              <TraceRow label="Approval" value={currentRun?.approvalRequired ?? "not tracked"} />
              <TraceRow label="Vocabulary guard" value={currentRun?.vocabularyAdjusted ? "adjusted" : "clean"} />
              <TraceRow label="Cached" value={currentRun?.cached ? "yes" : "no"} />
              <TraceRow label="Redaction" value={currentRun?.redactionLevel ?? "Summary"} />
              <TraceRow label="Latency" value={currentRun ? `${currentRun.latencyMs} ms` : "pending"} />
            </div>

            {why ? (
              <div className="rounded-md border border-[hsl(var(--ai-border)/0.45)] bg-background p-3">
                <div className="text-sm font-semibold">Inline Why</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{why}</p>
              </div>
            ) : null}

            <div>
              <div className="mb-2 text-sm font-semibold">Source References</div>
              <div className="space-y-2">
                {(currentRun?.sourceRefs ?? ["local-json-repo", "demo-policy-rules"]).map((source) => (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-background p-3 text-sm" key={source}>
                    <ChevronRight className="h-4 w-4 text-primary" />
                    {source}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold">Workflow Steps</div>
              <div className="space-y-2">
                {(currentRun?.steps ?? [{ name: "Repo context", source: "LocalJsonRepo", output: "Summary context only" }]).map((step, index) => (
                  <div className="rounded-md border border-border bg-background p-3" key={`${step.name}-${index}`}>
                    <div className="text-sm font-semibold">{step.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Source: {step.source}</div>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-4 text-muted-foreground">
                      {formatTraceOutput(step.output)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            {evidencePack ? (
              <div className="flex justify-end border-t border-border pt-4">
                <EvidenceExportButton label="Export this trace" pack={evidencePack} />
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}

function TraceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-medium">{value}</span>
    </div>
  );
}

function TracePill({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
      style={{
        background: muted ? "hsl(var(--brand-offwhite) / 0.72)" : "linear-gradient(135deg, hsl(var(--ai-accent-pink) / 0.12), hsl(var(--brand-gold) / 0.16))",
        borderColor: "hsl(var(--ai-border) / 0.45)",
        color: "hsl(var(--ai-foreground))"
      }}
    >
      {children}
    </span>
  );
}

function StateButton({
  children,
  disabled,
  loading,
  onClick,
  tone = "edit"
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  tone?: "edit" | "approve" | "return" | "delete";
}) {
  const toneStyle =
    tone === "approve"
      ? "border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.12)] text-success hover:bg-[hsl(var(--success)/0.18)]"
      : tone === "return"
        ? "border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.12)] text-warning hover:bg-[hsl(var(--warning)/0.18)]"
        : tone === "delete"
          ? "border-[hsl(var(--danger)/0.35)] bg-[hsl(var(--danger)/0.08)] text-danger hover:bg-[hsl(var(--danger)/0.13)]"
          : "border-[hsl(var(--brand-gold)/0.52)] bg-[hsl(var(--brand-gold)/0.14)] text-[hsl(var(--ai-foreground))] hover:bg-[hsl(var(--brand-gold)/0.22)]";
  return (
    <button
      className={`rounded-md border px-4 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${toneStyle}`}
      disabled={disabled || loading}
      onClick={onClick}
      type="button"
    >
      {loading ? "Working..." : children}
    </button>
  );
}

async function postRunTransition(
  runId: string,
  transition: "edited" | "approved" | "rejected" | "discarded" | "sent",
  note: string,
  options: { fourEyesWaived?: boolean } = {}
) {
  const response = await fetch(`/api/copilot/runs/${encodeURIComponent(runId)}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transition, note, ...options })
  });
  return (await response.json()) as { ok: boolean; reason?: string; output?: AgentRun };
}

function formatStateLabel(state: AgentRun["state"] | "prepared") {
  if (state === "rejected") return "returned for edit";
  if (state === "discarded") return "deleted";
  return state;
}

function formatApprovalRequirement(approval?: AgentRun["approvalRequired"]) {
  if (approval === "manager-approval") return "manager approval required";
  if (approval === "rm-approval") return "RM approval required";
  return "approval required";
}

function getInlineWhy(run?: AgentRun) {
  if (run?.why) {
    return run.why;
  }

  const output = run?.output;
  if (isRecord(output) && typeof output.why === "string") {
    return output.why;
  }

  const ruleStep = run?.steps.find((step) => step.name.toLowerCase().includes("rules"));
  if (ruleStep && isRecord(ruleStep.output)) {
    const priority = formatUnknown(ruleStep.output.priorityTier);
    const bullets = formatUnknown(ruleStep.output.bullets);
    if (priority || bullets) {
      return [`Priority ${priority || "context"}`, bullets ? `${bullets} prepared points` : ""].filter(Boolean).join("; ") + ".";
    }
  }

  const firstStep = run?.steps[0];
  return firstStep ? `${firstStep.name} supplied trace evidence from ${firstStep.source}.` : undefined;
}

function formatTraceOutput(output: unknown) {
  if (typeof output === "string") return output;
  return JSON.stringify(output, null, 2);
}

function formatUnknown(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
