"use client";

import { useState } from "react";
import type { AgentRun } from "@/lib/repo/types";

type Transition = "approved" | "rejected";

type ApprovalTransitionControlsProps = {
  runId?: string;
  initialState?: AgentRun["state"];
  compact?: boolean;
};

export function ApprovalTransitionControls({
  runId,
  initialState = "prepared",
  compact
}: ApprovalTransitionControlsProps) {
  const [state, setState] = useState<AgentRun["state"]>(initialState);
  const [loading, setLoading] = useState<Transition | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!runId) {
    return (
      <span className="rounded-[8px] border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
        Open trace
      </span>
    );
  }

  async function transition(next: Transition) {
    if (!runId) return;
    setLoading(next);
    setError(null);
    try {
      const response = await fetch(`/api/copilot/runs/${encodeURIComponent(runId)}/transition`, {
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
    } catch {
      setError("network error");
    } finally {
      setLoading(null);
    }
  }

  async function approveAndSend() {
    if (!runId) return;
    setLoading("approved");
    setError(null);
    try {
      const approved = await postTransition(runId, "approved", "Manager approved and sent from queue");
      if (!approved.ok || !approved.output) {
        setError(approved.reason ?? "approval failed");
        return;
      }
      const sent = await postTransition(runId, "sent", "Sent after manager approval");
      if (!sent.ok || !sent.output) {
        setState(approved.output.state ?? "approved");
        setError(sent.reason ?? "send failed after approval");
        return;
      }
      setState(sent.output.state ?? "sent");
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
        <button
          className="rounded-[8px] bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading !== null}
          onClick={approveAndSend}
          type="button"
        >
          {loading === "approved" ? "Sending..." : "Approve & send"}
        </button>
        <button
          className="rounded-[8px] border border-border-strong bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading !== null}
          onClick={() => transition("rejected")}
          type="button"
        >
          {loading === "rejected" ? "Saving..." : "Return for edit"}
        </button>
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
