import { createHash } from "node:crypto";
import type { CopilotClient, CopilotContext, CopilotRunRequest, CopilotRunResponse, CopilotRuntime } from "@/lib/agent-studio/types";
import { getRiskComplianceSummary } from "@/lib/domain/risk-compliance";
import { applyVocabularyGuardToOutput } from "@/lib/copilot/guard";
import { composeInlineWhy } from "@/lib/copilot/why";
import { getLLM } from "@/lib/llm";
import type { AgentRun } from "@/lib/repo/types";

interface TermExplainerOutput {
  headline: string;
  term: string;
  plainLanguage: string;
  riskNotes: string[];
  customerContext: string[];
  evidence: string[];
  openItems: string[];
}

export class TermExplainerClient implements CopilotClient {
  constructor(private readonly requestedRuntime?: CopilotRuntime) {}

  async run(request: CopilotRunRequest, context: CopilotContext): Promise<CopilotRunResponse> {
    const startedAt = new Date();
    const llm = getLLM(undefined, context.modelRoute);
    const ruleOutput = buildTermOutput(request, context);
    const system = [
      "You are Dyna Beacon's term explainer for wealth relationship managers.",
      "Explain terms for RM comprehension only. Do not provide client advice.",
      "Use only supplied Beacon context. Do not invent facts.",
      "Use prepare, surface, trace, evidence, approval language.",
      `Copilot posture is ${context.posture}: conservative = plain-language explanation; balanced = add practical context; forward = surface more open questions but do not change suitability gates.`,
      "Return JSON only with keys: headline, term, plainLanguage, riskNotes, customerContext, evidence, openItems."
    ].join("\n");
    const user = buildLLMUserPrompt(request, context, ruleOutput);
    const completion = await llm.complete(system, user, {
      mockText: JSON.stringify(ruleOutput),
      temperature: 0.25,
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
      error: error instanceof Error ? error.message : "LLM request failed"
    }));
    const parsedOutput = parseTermOutput(completion.text);
    const output = parsedOutput ?? ruleOutput;
    const guard = applyVocabularyGuardToOutput(output);
    const finishedAt = new Date();
    const runId = `run_${request.module}_${context.customer?.customerId ?? "general"}_${Date.now()}`;
    const steps: AgentRun["steps"] = [
      {
        name: "Build Copilot context",
        inputRef: context.customer?.customerId,
        source: "LocalJsonRepo",
        output: {
          customerScoped: Boolean(context.customer),
          products: context.products?.length ?? 0,
          holdings: context.holdings?.length ?? 0,
          lifecycleEvents: context.lifecycleEvents?.length ?? 0
        }
      },
      {
        name: "Apply copilot posture",
        source: "COPILOT_POSTURE",
        output: {
          posture: context.posture,
          note: "Posture affects explanation depth only; source refs and guard remain unchanged."
        }
      },
      {
        name: "Apply term-explainer rules",
        source: "BeaconRules",
        output: {
          term: output.term,
          riskNotes: output.riskNotes.length,
          customerContext: output.customerContext.length
        }
      },
      {
        name: "Skill-direct completion",
        source: completion.llmProvider,
        output: {
          model: completion.model,
          llmProvider: completion.llmProvider,
          parseState: parsedOutput ? "json" : "fallback-to-rules",
          usage: completion.usage,
          error: "error" in completion ? completion.error : undefined
        }
      },
      ...(guard.step ? [guard.step] : [])
    ];

    const run: AgentRun = {
      runId,
      channel: "term_explainer",
      moduleId: request.module,
      requestedRuntime: context.runtimeOverride ?? this.requestedRuntime ?? "skill-direct",
      backend: "skill-direct",
      model: completion.model,
      llmProvider: completion.llmProvider,
      skillVersion: "term-explainer@phase4-step5",
      state: "prepared",
      approvalRequired: "auto",
      why: composeInlineWhy(steps),
      vocabularyAdjusted: guard.vocabularyAdjusted,
      cached: false,
      workflowId: "skill_direct_term_explainer",
      personaId: "asia-wealth-rm",
      customerId: context.customer?.customerId,
      rmId: context.actor.rmId,
      roleAtRun: context.roleAtRun,
      inputDigest: digestInput(context),
      sourceRefs: context.sourceRefs,
      steps,
      output: guard.output,
      fallbackMode: false,
      redactionLevel: "Summary",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      latencyMs: Math.max(completion.latencyMs, finishedAt.getTime() - startedAt.getTime())
    };

    return { ok: true, runId, output: run };
  }
}

function buildTermOutput(request: CopilotRunRequest, context: CopilotContext): TermExplainerOutput {
  const term = extractTerm(request.intent) || extractTerm(context.personalization.rmCustomInput) || "selected product term";
  const topHolding = [...(context.holdings ?? [])].sort((a, b) => b.value - a.value)[0];
  const product = context.products?.find((item) => item.productId === topHolding?.productId);
  const compliance = context.customer ? getRiskComplianceSummary(context.customer, context.holdings ?? [], context.products ?? []) : undefined;

  return {
    headline: `Explained ${term}`,
    term,
    plainLanguage: `${term} is prepared as an RM comprehension note. Use the product facts, risk profile, and approval evidence before client-facing use.`,
    riskNotes: [
      product ? `Nearest visible product context: ${product.name}, ${product.category}, risk ${product.riskLevel}.` : "No selected product was provided; explanation uses general Beacon product context.",
      context.customer ? `Customer risk profile: ${context.customer.riskProfile}; funding currency: ${context.customer.fundingCurrency}.` : "No customer context is attached on this page.",
      compliance ? `Compliance state surfaced: ${compliance.worst}.` : "Compliance state requires a scoped customer."
    ],
    customerContext: context.customer
      ? [
          `Customer: ${context.customer.name}`,
          `Service tier: ${context.customer.serviceTier}`,
          `K&E status: ${context.customer.knowledgeAssessmentStatus}`
        ]
      : ["General product-pool explanation."],
    evidence: [
      `Loaded ${context.products?.length ?? 0} products.`,
      `Loaded ${context.holdings?.length ?? 0} holdings.`,
      `Source refs: ${context.sourceRefs.length}.`
    ],
    openItems: [
      "Confirm product factsheet before client-facing use.",
      "Keep final explanation under RM and institution approval."
    ]
  };
}

function buildLLMUserPrompt(request: CopilotRunRequest, context: CopilotContext, ruleOutput: TermExplainerOutput) {
  return JSON.stringify({
    module: request.module,
    intent: request.intent,
    rmPersonalization: context.personalization,
    customer: context.customer
      ? {
          customerId: context.customer.customerId,
          name: context.customer.name,
          riskProfile: context.customer.riskProfile,
          serviceTier: context.customer.serviceTier,
          fundingCurrency: context.customer.fundingCurrency,
          knowledgeAssessmentStatus: context.customer.knowledgeAssessmentStatus
        }
      : undefined,
    products: context.products?.slice(0, 12),
    holdings: context.holdings?.slice(0, 8),
    ruleScaffold: ruleOutput,
    sourceRefs: context.sourceRefs
  });
}

function parseTermOutput(text: string): TermExplainerOutput | undefined {
  const parsed = parseJsonObject(text);
  if (!parsed) return undefined;
  const headline = stringValue(parsed.headline);
  const term = stringValue(parsed.term);
  const plainLanguage = stringValue(parsed.plainLanguage);
  if (!headline || !term || !plainLanguage) return undefined;
  return {
    headline,
    term,
    plainLanguage,
    riskNotes: stringArray(parsed.riskNotes).slice(0, 5),
    customerContext: stringArray(parsed.customerContext).slice(0, 5),
    evidence: stringArray(parsed.evidence).slice(0, 6),
    openItems: stringArray(parsed.openItems).slice(0, 5)
  };
}

function extractTerm(value?: string) {
  if (!value) return "";
  return value.trim().replace(/^explain\s+/i, "").slice(0, 80);
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

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function digestInput(context: CopilotContext) {
  return createHash("sha256")
    .update(JSON.stringify({
      module: context.module,
      customerId: context.customer?.customerId,
      intent: context.intent,
      modelRoute: context.modelRoute,
      personalization: context.personalization,
      sourceRefs: context.sourceRefs
    }))
    .digest("hex")
    .slice(0, 16);
}
