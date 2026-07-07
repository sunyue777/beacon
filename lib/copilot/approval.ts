import type { AgentRun, RMRole } from "@/lib/repo/types";
import { runRequiresFourEyesWaiver } from "@/lib/copilot/approval-matrix";

export type AgentRunTransition = "edited" | "approved" | "rejected" | "discarded" | "sent";
export type AgentRunTransitionOptions = {
  fourEyesWaived?: boolean;
};

export function isAgentRunTransition(value: unknown): value is AgentRunTransition {
  return value === "edited" || value === "approved" || value === "rejected" || value === "discarded" || value === "sent";
}

export function canTransitionAgentRun(
  run: AgentRun,
  transition: AgentRunTransition,
  actor: { rmId: string; role: RMRole },
  options: AgentRunTransitionOptions = {}
): { ok: true } | { ok: false; reason: string } {
  const current = run.state ?? "prepared";

  if (transition === "sent") {
    if (current !== "approved") {
      return { ok: false, reason: "send requires approved state" };
    }
    return { ok: true };
  }

  if (current === "sent" || current === "discarded") {
    return { ok: false, reason: `${current} output is closed` };
  }

  if (transition === "edited") {
    if (current === "approved") {
      return { ok: false, reason: `cannot edit ${current} output` };
    }
    if (current === "rejected" && actor.rmId !== run.rmId) {
      return { ok: false, reason: "returned draft must be edited by originating RM" };
    }
    return { ok: true };
  }

  if (transition === "rejected") {
    if (current === "rejected") {
      return { ok: false, reason: "output already rejected" };
    }
    if (current === "approved") {
      return { ok: false, reason: "approved output cannot be returned" };
    }
    if (run.approvalRequired === "manager-approval" && actor.role !== "Manager") {
      return { ok: false, reason: "manager review required" };
    }
    if (run.approvalRequired === "manager-approval" && actor.rmId === run.rmId) {
      return { ok: false, reason: "originator cannot return own draft" };
    }
    if (run.approvalRequired === "rm-approval" && actor.role === "Junior") {
      return { ok: false, reason: "junior outputs require manager review" };
    }
    if (run.approvalRequired === "rm-approval" && actor.rmId !== run.rmId) {
      return { ok: false, reason: "owning RM review required" };
    }
    return { ok: true };
  }

  if (transition === "discarded") {
    if (current === "approved") {
      return { ok: false, reason: "approved output cannot be deleted" };
    }
    if (actor.rmId !== run.rmId) {
      return { ok: false, reason: "draft can only be deleted by originating RM" };
    }
    return { ok: true };
  }

  if (transition === "approved") {
    if (current === "approved") {
      return { ok: false, reason: "output already approved" };
    }
    if (run.approvalRequired === "manager-approval" && actor.role !== "Manager") {
      return { ok: false, reason: "manager approval required" };
    }
    if (run.approvalRequired === "manager-approval" && actor.rmId === run.rmId) {
      return { ok: false, reason: "originator cannot approve own draft" };
    }
    if (run.approvalRequired === "rm-approval" && actor.role === "Junior") {
      return { ok: false, reason: "junior outputs require manager approval" };
    }
    if (run.approvalRequired === "rm-approval" && actor.rmId !== run.rmId) {
      return { ok: false, reason: "owning RM approval required" };
    }
    if (runRequiresFourEyesWaiver(run, actor) && !options.fourEyesWaived) {
      return { ok: false, reason: "four-eyes waiver required for own manager draft" };
    }
    return { ok: true };
  }

  return { ok: false, reason: "unsupported transition" };
}

export function auditTypeForTransition(transition: AgentRunTransition) {
  if (transition === "edited") return "draft.edited" as const;
  if (transition === "approved") return "draft.approved" as const;
  if (transition === "rejected") return "draft.rejected" as const;
  if (transition === "discarded") return "draft.discarded" as const;
  return "draft.sent" as const;
}
