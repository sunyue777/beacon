import type { AgentRun } from "@/lib/repo/types";

export function getComplianceGateReason(run: AgentRun | undefined) {
  const step = run?.steps.find((item) => item.name === "Compliance gate");
  const output = step?.output;
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return undefined;
  }
  const reason = "reason" in output ? output.reason : undefined;
  if (typeof reason === "string" && reason.trim()) {
    return reason.trim();
  }
  const action = "action" in output ? output.action : undefined;
  return typeof action === "string" && action.trim() ? action.trim() : undefined;
}
