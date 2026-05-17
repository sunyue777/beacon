import { createHash } from "node:crypto";
import type { CopilotClient, CopilotContext, CopilotRunRequest, CopilotRunResponse } from "@/lib/agent-studio/types";
import { getPriorityReason, getPriorityTier, getReviewStatus, formatRelativeDays } from "@/lib/domain/client-signals";
import { getRiskComplianceSummary } from "@/lib/domain/risk-compliance";
import { composeInlineWhy } from "@/lib/copilot/why";
import type { AgentRun } from "@/lib/repo/types";

interface NextBestActionOutput {
  headline: string;
  why: string;
  actions: Array<{
    id: string;
    label: string;
    reason: string;
    channel: "call" | "email" | "whatsapp" | "approval" | "review";
    requiredApproval: "none" | "rm-approval" | "manager-approval";
  }>;
  evidence: string[];
  openItems: string[];
}

export class NextBestActionClient implements CopilotClient {
  async run(request: CopilotRunRequest, context: CopilotContext): Promise<CopilotRunResponse> {
    if (!context.customer) {
      return {
        ok: false,
        status: 400,
        code: "customer_required",
        reason: "Next best action requires a customer context."
      };
    }

    const startedAt = new Date();
    const output = buildNextBestActionOutput(context);
    const finishedAt = new Date();
    const runId = `run_${request.module}_${context.customer.customerId}_${Date.now()}`;
    const steps: AgentRun["steps"] = [
      {
        name: "Build Copilot context",
        inputRef: context.customer.customerId,
        source: "LocalJsonRepo",
        output: {
          holdings: context.holdings?.length ?? 0,
          transactions: context.transactions?.length ?? 0,
          lifecycleEvents: context.lifecycleEvents?.length ?? 0
        }
      },
      {
        name: "Rank deterministic service actions",
        source: "BeaconRules",
        output: {
          actions: output.actions.map((action) => action.id),
          priorityTier: getPriorityTier(context.customer.priorityScore)
        }
      }
    ];

    const run: AgentRun = {
      runId,
      channel: "nba",
      moduleId: request.module,
      requestedRuntime: context.runtimeOverride ?? "deterministic",
      backend: "deterministic",
      model: "beacon-rules-v1",
      llmProvider: "deterministic",
      skillVersion: "next-best-action@phase4-step6",
      state: "prepared",
      approvalRequired: "auto",
      why: composeInlineWhy(steps),
      vocabularyAdjusted: false,
      cached: false,
      workflowId: "deterministic_next_best_action",
      personaId: "asia-wealth-rm",
      customerId: context.customer.customerId,
      rmId: context.actor.rmId,
      roleAtRun: context.roleAtRun,
      inputDigest: digestInput(context),
      sourceRefs: context.sourceRefs,
      steps,
      output,
      fallbackMode: false,
      redactionLevel: "Summary",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      latencyMs: Math.max(1, finishedAt.getTime() - startedAt.getTime())
    };

    return { ok: true, runId, output: run };
  }
}

function buildNextBestActionOutput(context: CopilotContext): NextBestActionOutput {
  const customer = context.customer;
  if (!customer) throw new Error("Customer context is required.");

  const review = getReviewStatus(customer.nextReviewDate);
  const compliance = getRiskComplianceSummary(customer, context.holdings ?? [], context.products ?? []);
  const priorityTier = getPriorityTier(customer.priorityScore);
  const actions: NextBestActionOutput["actions"] = [];

  if (review.kind === "overdue" || review.kind === "due-soon") {
    actions.push({
      id: "prepare-review-call",
      label: "Prepare review call",
      reason: `${review.label}; last contact ${formatRelativeDays(customer.lastContactedAt).toLowerCase()}.`,
      channel: "call",
      requiredApproval: "none"
    });
  }

  if (compliance.worst !== "Pass") {
    actions.push({
      id: "inspect-approval-path",
      label: "Inspect approval path",
      reason: `${compliance.worst} compliance state surfaced across suitability, K&E, concentration, currency, liquidity, or risk checks.`,
      channel: "approval",
      requiredApproval: "none"
    });
  }

  actions.push({
    id: "prepare-client-touch",
    label: "Prepare client touch",
    reason: getPriorityReason(customer),
    channel: "email",
    requiredApproval: "none"
  });

  actions.push({
    id: "prepare-short-opener",
    label: "Prepare short opener",
    reason: "A short, evidence-backed opener can precede a fuller review pack.",
    channel: "whatsapp",
    requiredApproval: "none"
  });

  return {
    headline: `Surfaced service actions for ${customer.name}`,
    why: `${priorityTier} priority, ${review.label.toLowerCase()}, and ${compliance.worst} compliance state determined the action order.`,
    actions: actions.slice(0, 4),
    evidence: [
      `Priority score ${customer.priorityScore} mapped to ${priorityTier}.`,
      `Review status: ${review.label}.`,
      `Compliance state: ${compliance.worst}.`
    ],
    openItems: [
      "Action order is deterministic and traceable.",
      "If an action opens draft_assist, that client-facing draft is approval-gated separately."
    ]
  };
}

function digestInput(context: CopilotContext) {
  return createHash("sha256")
    .update(JSON.stringify({
      module: context.module,
      customerId: context.customer?.customerId,
      intent: context.intent,
      personalization: context.personalization,
      sourceRefs: context.sourceRefs
    }))
    .digest("hex")
    .slice(0, 16);
}
