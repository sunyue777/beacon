import { createHash } from "node:crypto";
import type { CopilotClient, CopilotContext, CopilotRunRequest, CopilotRunResponse } from "@/lib/agent-studio/types";
import { getPriorityReason, getPriorityTier, getReviewStatus, formatRelativeDays } from "@/lib/domain/client-signals";
import { getRiskComplianceSummary } from "@/lib/domain/risk-compliance";
import { composeInlineWhy } from "@/lib/copilot/why";
import { formatCurrency } from "@/lib/utils/format";
import { toUsd } from "@/lib/utils/currency";
import type { Account, AgentRun, CustomerProfile, Holding, LifecycleEvent, Product } from "@/lib/repo/types";

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

type Action = NextBestActionOutput["actions"][number];

type PrimarySignal = {
  action: Action;
  evidence: string[];
};

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
  const evidence: string[] = [
    `Priority score ${customer.priorityScore} mapped to ${priorityTier}.`,
    `Review status: ${review.label}.`,
    `Compliance state: ${compliance.worst}.`
  ];

  const primarySignal = buildPrimarySignalAction(context);
  if (primarySignal) {
    actions.push(primarySignal.action);
    evidence.push(...primarySignal.evidence);
  } else {
    actions.push({
      id: "prepare-client-touch",
      label: "Prepare client touch",
      reason: getPriorityReason(customer),
      channel: "email",
      requiredApproval: "none"
    });
  }

  if (compliance.suitability.state === "Block") {
    actions.push({
      id: "refresh-suitability-questionnaire",
      label: "Refresh suitability questionnaire",
      reason: `Suitability expired on ${compliance.suitability.expiresAt}; refresh before any client-facing advisory draft.`,
      channel: "review",
      requiredApproval: "none"
    });
  }

  if (review.kind === "overdue" || review.kind === "due-soon") {
    actions.push({
      id: "prepare-review-call",
      label: "Prepare review call",
      reason: `${review.label}; last contact ${formatRelativeDays(customer.lastContactedAt).toLowerCase()}.`,
      channel: "call",
      requiredApproval: "none"
    });
  }

  if (compliance.worst !== "Pass" && compliance.suitability.state !== "Block") {
    actions.push({
      id: "inspect-approval-path",
      label: "Inspect approval path",
      reason: `${compliance.worst} compliance state surfaced across suitability, K&E, concentration, currency, liquidity, or risk checks.`,
      channel: "approval",
      requiredApproval: "none"
    });
  }

  if (!primarySignal) {
    actions.push({
      id: "prepare-short-opener",
      label: "Prepare short opener",
      reason: "A short, evidence-backed opener can precede a fuller review pack.",
      channel: "whatsapp",
      requiredApproval: "none"
    });
  }

  return {
    headline: `Surfaced service actions for ${customer.name}`,
    why: `${priorityTier} priority, ${review.label.toLowerCase()}, and ${compliance.worst} compliance state determined the action order.`,
    actions: actions.slice(0, 4),
    evidence: [...new Set(evidence)].slice(0, 8),
    openItems: [
      "Action order is deterministic and traceable.",
      "If an action opens draft_assist, that client-facing draft is approval-gated separately."
    ]
  };
}

function buildPrimarySignalAction(context: CopilotContext): PrimarySignal | undefined {
  const customer = context.customer;
  if (!customer) return undefined;
  const holdings = context.holdings ?? [];
  const products = context.products ?? [];
  const accounts = context.accounts ?? [];
  const lifecycleEvents = context.lifecycleEvents ?? [];

  for (const tag of customer.tags) {
    if (tag === "Maturity") {
      return buildMaturityAction(customer, holdings, products, lifecycleEvents);
    }
    if (tag === "DormantCash") {
      return buildDormantCashAction(accounts);
    }
    if (tag === "RiskMismatch") {
      return buildRiskMismatchAction(customer, holdings, products);
    }
  }
  return undefined;
}

function buildMaturityAction(
  customer: CustomerProfile,
  holdings: Holding[],
  products: Product[],
  lifecycleEvents: LifecycleEvent[]
): PrimarySignal | undefined {
  const productById = new Map(products.map((product) => [product.productId, product]));
  const maturityEvent = [...lifecycleEvents]
    .filter((event) => event.type === "Maturity")
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const maturityHolding = [...holdings].sort((left, right) => {
    const leftProduct = productById.get(left.productId);
    const rightProduct = productById.get(right.productId);
    const leftScore = maturityProductScore(leftProduct);
    const rightScore = maturityProductScore(rightProduct);
    return rightScore - leftScore || toUsd(right.value, right.currency) - toUsd(left.value, left.currency);
  })[0];
  if (!maturityHolding) return undefined;

  const product = productById.get(maturityHolding.productId);
  const productName = product?.name ?? "Maturity-linked holding";
  const date = maturityEvent?.date ?? customer.nextReviewDate;
  const amount = formatCurrency(maturityHolding.value, maturityHolding.currency, { compact: true });

  return {
    action: {
      id: "prepare-maturity-reinvestment-options",
      label: "Prepare reinvestment options",
      reason: `${productName} matures ${date} (${amount}).`,
      channel: "email",
      requiredApproval: "none"
    },
    evidence: [
      `holding:${maturityHolding.holdingId} - ${productName}, ${amount}.`,
      maturityEvent
        ? `event:${maturityEvent.eventId} - ${maturityEvent.title} on ${maturityEvent.date}.`
        : `customer:${customer.customerId} - next review date ${customer.nextReviewDate} used as maturity timing fallback.`
    ]
  };
}

function buildDormantCashAction(accounts: Account[]): PrimarySignal | undefined {
  const cashAccounts = accounts.filter((account) =>
    account.cashBalance > 0 && (account.status === "Dormant" || account.type === "Cash")
  );
  if (cashAccounts.length === 0) return undefined;
  const currency = cashAccounts[0].currency;
  const sameCurrency = cashAccounts.every((account) => account.currency === currency);
  const total = sameCurrency
    ? cashAccounts.reduce((sum, account) => sum + account.cashBalance, 0)
    : cashAccounts.reduce((sum, account) => sum + toUsd(account.cashBalance, account.currency), 0);
  const formatted = sameCurrency
    ? formatCurrency(total, currency, { compact: true })
    : formatCurrency(total, "USD", { compact: true });
  const accountWord = cashAccounts.length === 1 ? "account" : "accounts";

  return {
    action: {
      id: "prepare-dormant-cash-liquidity-check",
      label: "Prepare liquidity check",
      reason: `${formatted} idle cash across ${cashAccounts.length} ${accountWord}.`,
      channel: "call",
      requiredApproval: "none"
    },
    evidence: [
      `account:${cashAccounts.map((account) => account.accountId).join(", ")} - ${formatted} idle cash across ${cashAccounts.length} ${accountWord}.`
    ]
  };
}

function buildRiskMismatchAction(
  customer: CustomerProfile,
  holdings: Holding[],
  products: Product[]
): PrimarySignal | undefined {
  const productById = new Map(products.map((product) => [product.productId, product]));
  const mismatch = [...holdings]
    .filter((holding) => holding.riskStatus === "mismatch")
    .sort((left, right) => toUsd(right.value, right.currency) - toUsd(left.value, left.currency))[0];
  if (!mismatch) return undefined;

  const product = productById.get(mismatch.productId);
  const productName = product?.name ?? "Mismatched holding";
  const productRisk = product?.riskLevel ?? "portfolio";
  const amount = formatCurrency(mismatch.value, mismatch.currency, { compact: true });

  return {
    action: {
      id: "inspect-risk-mismatch-holding",
      label: "Inspect risk mismatch",
      reason: `${productName} is ${productRisk} vs ${customer.riskProfile} profile (${amount}).`,
      channel: "approval",
      requiredApproval: "none"
    },
    evidence: [
      `holding:${mismatch.holdingId} - ${productName}, ${amount}, risk ${productRisk} vs profile ${customer.riskProfile}.`
    ]
  };
}

function maturityProductScore(product: Product | undefined) {
  if (!product) return 0;
  if (product.category === "Structured" || /structured|note/i.test(product.name)) return 4;
  if (product.category === "Deposit" || /deposit|term/i.test(product.name)) return 3;
  if (product.category === "Bond") return 2;
  return 1;
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
