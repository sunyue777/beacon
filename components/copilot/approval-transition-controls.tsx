"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { canTransitionAgentRun } from "@/lib/copilot/approval";
import type { AgentRun, RMRole } from "@/lib/repo/types";

type Transition = "approved" | "rejected";

type ApprovalTransitionControlsProps = {
  runId?: string;
  run?: AgentRun;
  viewer?: { rmId: string; role: RMRole };
  initialState?: AgentRun["state"];
  compact?: boolean;
};

export function ApprovalTransitionControls({
  runId,
  run,
  viewer,
  initialState = "prepared",
  compact
}: ApprovalTransitionControlsProps) {
  const router = useRouter();
  const effectiveRunId = run?.runId ?? runId;
  const [state, setState] = useState<AgentRun["state"]>(run?.state ?? initialState);
  const [loading, setLoading] = useState<Transition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const approveCheck = run && viewer
    ? canTransitionAgentRun({ ...run, state }, "approved", viewer)
    : { ok: false as const, reason: "review context unavailable" };
  const rejectCheck = run && viewer
    ? canTransitionAgentRun({ ...run, state }, "rejected", viewer)
    : { ok: false as const, reason: "review context unavailable" };
  const canApprove = approveCheck.ok;
  const canReject = rejectCheck.ok;
  const reviewReason = !approveCheck.ok ? approveCheck.reason : !rejectCheck.ok ? rejectCheck.reason : null;

  if (!effectiveRunId) {
    return (
      <span className="rounded-[8px] border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
        Open trace
      </span>
    );
  }

  async function transition(next: Transition) {
    if (!effectiveRunId) return;
    setLoading(next);
    setError(null);
    try {
      const response = await fetch(`/api/copilot/runs/${encodeURIComponent(effectiveRunId)}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition: next })
      });
      const payload = (await response.json()) as { ok?: boolean; reason?: string; output?: AgentRun };
      if (!response.ok || !payload.ok || !payload.output) {
        setError(payload.reason ?? "transition failed");
        return;
      }
      setState(payload.output.state ?? next);
      router.refresh();
    } catch {
      setError("network error");
    } finally {
      setLoading(null);
    }
  }

  async function approveAndSend() {
    if (!effectiveRunId) return;
    setLoading("approved");
    setError(null);
    try {
      const approved = await postTransition(effectiveRunId, "approved", "Approved and sent from queue");
      if (!approved.ok || !approved.output) {
        setError(approved.reason ?? "approval failed");
        return;
      }
      const sent = await postTransition(effectiveRunId, "sent", "Sent after approval");
      if (!sent.ok || !sent.output) {
        setState(approved.output.state ?? "approved");
        setError(sent.reason ?? "send failed after approval");
        router.refresh();
        return;
      }
      setState(sent.output.state ?? "sent");
      router.refresh();
    } catch {
      setError("network error");
    } finally {
      setLoading(null);
    }
  }

  if (state === "approved" || state === "rejected" || state === "sent") {
    const tone =
      state === "approved"
        ? "border-success/30 bg-success/10 text-success"
        : state === "rejected"
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-primary/30 bg-primary-soft text-primary";
    const label = state === "rejected" ? "returned for edit" : state === "sent" ? "sent" : state;
    return (
      <span className={`rounded-[8px] border px-2.5 py-1.5 text-[11px] font-semibold capitalize ${tone}`}>
        {label}
      </span>
    );
  }

  return (
    <div className={compact ? "flex flex-wrap items-center gap-1.5" : "flex flex-col gap-1.5"}>
      <div className="flex gap-1.5">
        {canApprove ? (
          <button
            className="rounded-[8px] bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading !== null}
            onClick={approveAndSend}
            type="button"
          >
            {loading === "approved" ? "Sending..." : "Approve & send"}
          </button>
        ) : (
          <span
            className="rounded-[8px] border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground"
            title={reviewReason ?? undefined}
          >
            Awaiting review
          </span>
        )}
        {canReject ? (
          <button
            className="rounded-[8px] border border-border-strong bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading !== null}
            onClick={() => transition("rejected")}
            type="button"
          >
            {loading === "rejected" ? "Saving..." : "Return for edit"}
          </button>
        ) : null}
      </div>
      {error ? <div className="max-w-[180px] text-[10px] leading-4 text-danger">{error}</div> : null}
    </div>
  );
}

async function postTransition(runId: string, transition: "approved" | "rejected" | "sent", note: string) {
  const response = await fetch(`/api/copilot/runs/${encodeURIComponent(runId)}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transition, note })
  });
  return (await response.json()) as { ok?: boolean; reason?: string; output?: AgentRun };
}
