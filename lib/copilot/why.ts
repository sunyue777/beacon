import type { AgentRun } from "@/lib/repo/types";

export function composeInlineWhy(steps: AgentRun["steps"]): string {
  const contextStep = steps.find((step) => step.name === "Build Copilot context");
  const rulesStep = steps.find((step) => step.name === "Apply talking-points rules");
  const guardStep = steps.find((step) => step.name === "Vocabulary guard");
  const fallbackStep = steps.find((step) => step.name === "Runtime fallback");

  const fragments: string[] = [];
  if (rulesStep && isRecord(rulesStep.output)) {
    const priority = stringify(rulesStep.output.priorityTier);
    const bullets = stringify(rulesStep.output.bullets);
    if (priority) fragments.push(`${priority} priority shaped the brief`);
    if (bullets) fragments.push(`${bullets} prepared points were assembled`);
  }
  if (contextStep && isRecord(contextStep.output)) {
    const holdings = stringify(contextStep.output.holdings);
    const events = stringify(contextStep.output.lifecycleEvents);
    fragments.push(`context used ${holdings || "0"} holdings and ${events || "0"} lifecycle signals`);
  }
  if (guardStep) fragments.push("vocabulary guard checked client-facing language");
  if (fallbackStep) fragments.push("runtime fallback kept the demo available");

  return fragments.length > 0
    ? `${fragments.join("; ")}.`
    : "Trace steps supplied the evidence used to prepare this output.";
}

function stringify(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
