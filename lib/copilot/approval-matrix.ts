import type { AgentRun, RMRole } from "@/lib/repo/types";

export type DraftApprovalFormat =
  | "concise_touch"
  | "meeting_confirm"
  | "review_followup"
  | "phone_opener"
  | "maturity_reminder"
  | "meeting_scheduling"
  | "formal_note"
  | "client_review_pack"
  | "tax_loss_harvesting"
  | "earnings_analysis";

export type DraftApprovalCategory = "routine_message" | "client_artifact";

const clientArtifactFormats = new Set<DraftApprovalFormat>([
  "formal_note",
  "client_review_pack",
  "tax_loss_harvesting",
  "earnings_analysis"
]);

export function getDraftApprovalCategory(format: DraftApprovalFormat): DraftApprovalCategory {
  return clientArtifactFormats.has(format) ? "client_artifact" : "routine_message";
}

export function approvalForDraftFormat(
  format: DraftApprovalFormat,
  role: RMRole
): NonNullable<AgentRun["approvalRequired"]> {
  const category = getDraftApprovalCategory(format);
  if (role === "Junior") {
    return "manager-approval";
  }
  if (role === "MidLevel") {
    return category === "client_artifact" ? "manager-approval" : "rm-approval";
  }
  return "rm-approval";
}

export function isClientArtifactFormat(format: DraftApprovalFormat) {
  return getDraftApprovalCategory(format) === "client_artifact";
}

export function runRequiresFourEyesWaiver(run: AgentRun, actor: { rmId: string; role: RMRole }) {
  if (actor.role !== "Manager" || actor.rmId !== run.rmId || run.approvalRequired !== "rm-approval") {
    return false;
  }
  if (run.roleAtRun !== "Manager" || run.moduleId !== "draft_assist") {
    return false;
  }
  const output = run.output;
  if (!output || typeof output !== "object") {
    return false;
  }
  const artifactKind = "artifactKind" in output ? output.artifactKind : undefined;
  const formatLabel = "formatLabel" in output && typeof output.formatLabel === "string" ? output.formatLabel : "";
  return artifactKind === "pdf" || /client review|tax|earnings|portfolio/i.test(formatLabel);
}
