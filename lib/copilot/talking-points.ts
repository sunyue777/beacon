import { createHash } from "node:crypto";
import type { CopilotClient, CopilotContext, CopilotRunRequest, CopilotRunResponse, CopilotRuntime } from "@/lib/agent-studio/types";
import { getPriorityReason, getPriorityTier, getReviewStatus, formatRelativeDays } from "@/lib/domain/client-signals";
import { getRiskComplianceSummary } from "@/lib/domain/risk-compliance";
import { applyVocabularyGuardToOutput } from "@/lib/copilot/guard";
import { composeInlineWhy } from "@/lib/copilot/why";
import { getLLM } from "@/lib/llm";
import type { AgentRun, Holding, LifecycleEvent } from "@/lib/repo/types";

interface TalkingPointsOutput {
  headline: string;
  why: string;
  bullets: string[];
  evidence: string[];
  openItems: string[];
}

export class TalkingPointsClient implements CopilotClient {
  constructor(private readonly requestedRuntime?: CopilotRuntime) {}

  async run(request: CopilotRunRequest, context: CopilotContext): Promise<CopilotRunResponse> {
    if (!context.customer) {
      return {
        ok: false,
        status: 400,
        code: "customer_required",
        reason: "Talking points require a customer context."
      };
    }

    const startedAt = new Date();
    const llm = getLLM(undefined, context.modelRoute);
    const ruleOutput = buildTalkingPointsOutput(context);
    const system = [
      "You are Dyna Beacon's RM copilot for wealth relationship preparation.",
      "Use only the supplied Beacon context. Do not invent client facts.",
      "Use prepare, surface, trace, evidence, approval language.",
      "Do not use advise, recommend, decide, you should, my advice, or the right choice.",
      `Copilot posture is ${context.posture}: conservative = evidence-first and brief; balanced = include options as scenarios; forward = surface more open items but keep approval language.`,
      "Return JSON only with keys: headline, why, bullets, evidence, openItems.",
      "bullets must contain exactly 4 concise strings. Make the output reflect the selected talking point and RM input."
    ].join("\n");
    const user = buildLLMUserPrompt(request, context, ruleOutput);
    const completion = await llm.complete(system, user, {
      mockText: JSON.stringify(ruleOutput),
      temperature: 0.35,
      maxTokens: 900
    }).catch((error) => ({
      text: JSON.stringify(ruleOutput),
      model: "beacon-local-fallback-v1",
      llmProvider: "local-fallback",
      latencyMs: 1,
      usage: {
        inputTokens: Math.ceil((system.length + user.length) / 4),
        outputTokens: Math.ceil(JSON.stringify(ruleOutput).length / 4)
      },
      error: formatLlmError(error)
    }));
    const parsedOutput = parseTalkingPointsOutput(completion.text);
    const output = parsedOutput ?? ruleOutput;
    const modelParseState = parsedOutput ? "json" : "fallback-to-rules";
    const guard = applyVocabularyGuardToOutput(output);
    const finishedAt = new Date();
    const runId = `run_${request.module}_${context.customer.customerId}_${Date.now()}`;
    const steps: AgentRun["steps"] = [
      {
        name: "Build Copilot context",
        inputRef: context.customer.customerId,
        source: "LocalJsonRepo",
        output: {
          accounts: context.accounts?.length ?? 0,
          holdings: context.holdings?.length ?? 0,
          transactions: context.transactions?.length ?? 0,
          lifecycleEvents: context.lifecycleEvents?.length ?? 0
        }
      },
      {
        name: "Apply copilot posture",
        source: "COPILOT_POSTURE",
        output: {
          posture: context.posture,
          note: "Posture nudges tone and detail level only; deterministic checks remain unchanged."
        }
      },
      {
        name: "Apply talking-points rules",
        source: "BeaconRules",
        output: {
          priorityTier: getPriorityTier(context.customer.priorityScore),
          bullets: ruleOutput.bullets.length,
          openItems: ruleOutput.openItems.length
        }
      },
      {
        name: "Skill-direct completion",
        source: completion.llmProvider,
        output: {
          model: completion.model,
          llmProvider: completion.llmProvider,
          parseState: modelParseState,
          usage: completion.usage,
          error: "error" in completion ? completion.error : undefined
        }
      },
      ...(guard.step ? [guard.step] : []),
      ...((context.runtimeOverride ?? this.requestedRuntime) && (context.runtimeOverride ?? this.requestedRuntime) !== "skill-direct"
        ? [{
            name: "Runtime fallback",
            source: "CopilotDispatch",
            output: {
              requestedRuntime: context.runtimeOverride ?? this.requestedRuntime,
              actualRuntime: "skill-direct",
              reason: "External runtime is selectable in the demo, but not connected yet."
            }
          }]
        : [])
    ];
    const run: AgentRun = {
      runId,
      channel: "talking_points",
      moduleId: request.module,
      requestedRuntime: context.runtimeOverride ?? this.requestedRuntime ?? "skill-direct",
      backend: "skill-direct",
      model: completion.model,
      llmProvider: completion.llmProvider,
      skillVersion: "talking-points@phase4-step3",
      state: "prepared",
      approvalRequired: "auto",
      why: composeInlineWhy(steps),
      vocabularyAdjusted: guard.vocabularyAdjusted,
      cached: false,
      workflowId: "skill_direct_talking_points",
      personaId: "asia-wealth-rm",
      customerId: context.customer.customerId,
      rmId: context.actor.rmId,
      roleAtRun: context.roleAtRun,
      inputDigest: digestInput(context),
      sourceRefs: context.sourceRefs,
      steps,
      output: guard.output,
      fallbackMode: (context.runtimeOverride ?? this.requestedRuntime ?? "skill-direct") !== "skill-direct",
      redactionLevel: "Summary",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      latencyMs: Math.max(completion.latencyMs, finishedAt.getTime() - startedAt.getTime())
    };

    return { ok: true, runId, output: run };
  }
}

function buildLLMUserPrompt(
  request: CopilotRunRequest,
  context: CopilotContext,
  ruleOutput: TalkingPointsOutput
) {
  const customer = context.customer;
  const selectedTalkingPoint = isRecord(context.uiContext?.selectedTalkingPoint)
    ? context.uiContext?.selectedTalkingPoint
    : undefined;
  const topHoldings = [...(context.holdings ?? [])]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((holding) => {
      const product = context.products?.find((item) => item.productId === holding.productId);
      return {
        productName: product?.name ?? holding.productId,
        category: product?.category,
        riskLevel: product?.riskLevel,
        value: holding.value,
        currency: holding.currency,
        pctOfAum: holding.pctOfAum,
        riskStatus: holding.riskStatus
      };
    });

  return JSON.stringify({
    module: request.module,
    intent: request.intent,
    selectedTalkingPoint,
    rmPersonalization: context.personalization,
    customer: customer
      ? {
          customerId: customer.customerId,
          name: customer.name,
          serviceTier: customer.serviceTier,
          segment: customer.segment,
          riskProfile: customer.riskProfile,
          totalAum: customer.totalAum,
          currency: customer.currency,
          priorityScore: customer.priorityScore,
          priorityTier: getPriorityTier(customer.priorityScore),
          priorityReason: getPriorityReason(customer),
          lastContactedAt: customer.lastContactedAt,
          nextReviewDate: customer.nextReviewDate,
          reviewStatus: getReviewStatus(customer.nextReviewDate).label,
          fundingCurrency: customer.fundingCurrency,
          knowledgeAssessmentStatus: customer.knowledgeAssessmentStatus,
          riskProfileExpiresAt: customer.riskProfileExpiresAt,
          suitabilityExpiresAt: customer.suitabilityExpiresAt
        }
      : undefined,
    topHoldings,
    lifecycleEvents: context.lifecycleEvents?.slice(0, 5),
    recentTransactions: context.transactions?.slice(0, 5),
    marketSnapshot: context.marketSnapshot,
    ruleScaffold: ruleOutput,
    sourceRefs: context.sourceRefs
  });
}

function parseTalkingPointsOutput(text: string): TalkingPointsOutput | undefined {
  const parsed = parseJsonObject(text);
  if (!parsed) return undefined;
  const headline = typeof parsed.headline === "string" ? parsed.headline : undefined;
  const why = typeof parsed.why === "string" ? parsed.why : undefined;
  const bullets = Array.isArray(parsed.bullets) ? parsed.bullets.filter((item): item is string => typeof item === "string").slice(0, 4) : [];
  const evidence = Array.isArray(parsed.evidence) ? parsed.evidence.filter((item): item is string => typeof item === "string").slice(0, 6) : [];
  const openItems = Array.isArray(parsed.openItems) ? parsed.openItems.filter((item): item is string => typeof item === "string").slice(0, 5) : [];
  if (!headline || !why || bullets.length === 0) return undefined;
  return {
    headline,
    why,
    bullets: padToFour(bullets),
    evidence,
    openItems
  };
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first < 0 || last <= first) return undefined;
    try {
      const parsed = JSON.parse(trimmed.slice(first, last + 1));
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

function padToFour(items: string[]) {
  const padded = [...items];
  while (padded.length < 4) {
    padded.push("Prepare evidence and approval trace before any client-facing action.");
  }
  return padded.slice(0, 4);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatLlmError(error: unknown) {
  if (!(error instanceof Error)) {
    return "LLM request failed";
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (isRecord(cause)) {
    const code = typeof cause.code === "string" ? cause.code : undefined;
    const hostname = typeof cause.hostname === "string" ? cause.hostname : undefined;
    const message = typeof cause.message === "string" && cause.message ? cause.message : undefined;
    return [error.message, code ? `cause=${code}` : "", hostname ? `host=${hostname}` : "", message ?? ""]
      .filter(Boolean)
      .join(" | ");
  }

  return error.message;
}

function buildTalkingPointsOutput(context: CopilotContext): TalkingPointsOutput {
  const customer = context.customer;
  if (!customer) {
    throw new Error("Customer context is required.");
  }

  const holdings = context.holdings ?? [];
  const products = context.products ?? [];
  const lifecycleEvents = context.lifecycleEvents ?? [];
  const transactions = context.transactions ?? [];
  const priorityTier = getPriorityTier(customer.priorityScore);
  const review = getReviewStatus(customer.nextReviewDate);
  const compliance = getRiskComplianceSummary(customer, holdings, products);
  const topEvent = lifecycleEvents[0];
  const topHolding = [...holdings].sort((a, b) => b.value - a.value)[0];
  const topProduct = products.find((product) => product.productId === topHolding?.productId);
  const lastTransaction = transactions[0];
  const requestedRuntime = context.runtimeOverride ?? "skill-direct";
  const preferences = derivePreferenceSignals(context);

  const bullets = buildInteractiveBullets({
    priorityTier,
    priorityReason: getPriorityReason(customer),
    reviewLabel: review.label,
    lastContact: formatRelativeDays(customer.lastContactedAt).toLowerCase(),
    topEvent,
    topHolding,
    topProduct,
    complianceWorst: compliance.worst,
    preferences,
    customer
  });

  if (compliance.worst !== "Pass") {
    bullets.push(`Compliance evidence surfaced: ${compliance.worst} state across suitability, K&E, concentration, currency, or liquidity checks.`);
  }

  const evidence = [
    `Priority score ${customer.priorityScore} mapped to ${priorityTier}.`,
    `Risk profile ${customer.riskProfile}; funding currency ${customer.fundingCurrency}.`,
    `Loaded ${holdings.length} holdings, ${transactions.length} transactions, and ${lifecycleEvents.length} lifecycle signals.`,
    `Runtime selected: ${requestedRuntime}; current execution uses Beacon local rules.`,
    `RM input focus: ${preferences.focusLabel}.`
  ];

  if (lastTransaction) {
    evidence.push(`Latest transaction trace: ${lastTransaction.action} on ${lastTransaction.tradeDate}.`);
  }

  const openItems = [
    review.kind === "overdue" ? "Prepare annual review evidence before client contact." : "Confirm whether review timing should be discussed.",
    compliance.worst === "Block" ? "Check approval or refresh requirement before any client-facing draft." : "Keep final client action under RM and institution approval.",
    preferences.channelAction
  ];

  if (context.personalization.customerHabits.length > 0) {
    bullets.push(`Customer habits noted by RM: ${context.personalization.customerHabits.join("; ")}.`);
  }

  if (context.personalization.rmCustomInput) {
    openItems.push(`RM custom input for this run: ${context.personalization.rmCustomInput}`);
  }

  return {
    headline: `${preferences.headlinePrefix} for ${customer.name}`,
    why: `${priorityTier} priority, ${review.label.toLowerCase()}, ${compliance.worst} compliance state, and RM input focus (${preferences.focusLabel}) shaped this brief.`,
    bullets: bullets.slice(0, 4),
    evidence,
    openItems
  };
}

function buildInteractiveBullets({
  priorityTier,
  priorityReason,
  reviewLabel,
  lastContact,
  topEvent,
  topHolding,
  topProduct,
  complianceWorst,
  preferences,
  customer
}: {
  priorityTier: string;
  priorityReason: string;
  reviewLabel: string;
  lastContact: string;
  topEvent?: LifecycleEvent;
  topHolding?: Holding;
  topProduct?: { name: string; category: string };
  complianceWorst: string;
  preferences: ReturnType<typeof derivePreferenceSignals>;
  customer: NonNullable<CopilotContext["customer"]>;
}) {
  const base = [
    `${priorityTier} relationship: ${priorityReason}.`,
    `Review status: ${reviewLabel}; last contact ${lastContact}.`,
    topEvent ? `Recent signal: ${topEvent.title} (${topEvent.importance}).` : "No high-priority lifecycle signal in the loaded context.",
    topHolding && topProduct ? `Largest visible holding: ${topProduct.name} in ${topProduct.category}.` : "Portfolio has limited holding detail in the loaded context."
  ];

  if (preferences.focus === "risk") {
    return [
      `Open with portfolio drift evidence against the stated ${customer.riskProfile} profile.`,
      topHolding && topProduct ? `Use ${topProduct.name} as the concrete holding trace before discussing alternatives.` : base[3],
      complianceWorst !== "Pass" ? `Keep the compliance ${complianceWorst} state visible before any client-facing draft.` : base[0],
      preferences.communicationPoint
    ];
  }

  if (preferences.focus === "maturity") {
    const maturitySignal = topEvent?.type === "Maturity" ? topEvent.title : undefined;
    return [
      maturitySignal ? `Start from the maturity signal: ${maturitySignal}.` : "Start from the next review or maturity window visible in Beacon.",
      `Frame the conversation as preparation, not advice; review status is ${reviewLabel}.`,
      preferences.communicationPoint,
      base[3]
    ];
  }

  if (preferences.focus === "compliance") {
    return [
      `Lead with evidence and approval status; current compliance state is ${complianceWorst}.`,
      `Check suitability, K&E, currency and liquidity traces before drafting any client message.`,
      preferences.communicationPoint,
      base[1]
    ];
  }

  if (preferences.focus === "relationship") {
    return [
      preferences.communicationPoint,
      `Acknowledge relationship context first, then surface ${priorityTier.toLowerCase()} priority evidence.`,
      topEvent ? `Use the latest signal only as supporting evidence: ${topEvent.title}.` : base[2],
      base[3]
    ];
  }

  return [
    base[0],
    preferences.communicationPoint,
    base[1],
    base[2]
  ];
}

function derivePreferenceSignals(context: CopilotContext) {
  const input = [
    context.intent,
    context.personalization.rmCustomInput,
    ...context.personalization.customerHabits
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const channel = input.includes("whatsapp")
    ? "WhatsApp"
    : input.includes("email")
      ? "email"
      : input.includes("call") || input.includes("phone")
        ? "phone call"
        : "RM follow-up";

  const tone = input.includes("calm")
    ? "calm"
    : input.includes("concise") || input.includes("brief")
      ? "concise"
      : input.includes("warm") || input.includes("relationship")
        ? "relationship-led"
        : "evidence-led";

  const focus = input.includes("maturity") || input.includes("deposit") || input.includes("renewal")
    ? "maturity"
    : input.includes("compliance") || input.includes("approval") || input.includes("suitability") || input.includes("k&e")
      ? "compliance"
      : input.includes("relationship") || input.includes("family") || input.includes("trust")
        ? "relationship"
        : input.includes("risk") || input.includes("drift") || input.includes("rebalance") || input.includes("portfolio")
          ? "risk"
          : "general";

  const focusLabel =
    focus === "risk"
      ? "portfolio drift"
      : focus === "maturity"
        ? "maturity timing"
        : focus === "compliance"
          ? "approval and compliance"
          : focus === "relationship"
            ? "relationship context"
            : "general service preparation";

  return {
    channel,
    tone,
    focus,
    focusLabel,
    headlinePrefix:
      focus === "risk"
        ? "Prepared drift conversation"
        : focus === "maturity"
          ? "Prepared maturity conversation"
          : focus === "compliance"
            ? "Prepared approval-aware brief"
            : focus === "relationship"
              ? "Prepared relationship-led brief"
              : "Prepared talking points",
    communicationPoint: `Use a ${tone} ${channel} framing and keep evidence visible before any client-facing action.`,
    channelAction: `Draft channel preference for RM review: ${channel}, ${tone} tone.`
  };
}

function digestInput(context: CopilotContext) {
  return createHash("sha256")
    .update(JSON.stringify({
      module: context.module,
      customerId: context.customer?.customerId,
      intent: context.intent,
      runtimeOverride: context.runtimeOverride,
      modelRoute: context.modelRoute,
      personalization: context.personalization,
      sourceRefs: context.sourceRefs
    }))
    .digest("hex")
    .slice(0, 16);
}
