import { createHash } from "node:crypto";
import type { CopilotClient, CopilotContext, CopilotRunRequest, CopilotRunResponse, CopilotRuntime } from "@/lib/agent-studio/types";
import { getPriorityReason, getPriorityTier, getReviewStatus, formatRelativeDays } from "@/lib/domain/client-signals";
import { getRiskComplianceSummary } from "@/lib/domain/risk-compliance";
import { applyVocabularyGuardToOutput } from "@/lib/copilot/guard";
import { composeInlineWhy } from "@/lib/copilot/why";
import { getLLM } from "@/lib/llm";
import type { AgentRun } from "@/lib/repo/types";
import rulesConfig from "@/data/copilot/rules.json";

interface DraftAssistOutput {
  headline: string;
  why: string;
  channel: "email" | "whatsapp" | "call_script";
  subject?: string;
  draft: string;
  artifactText?: string;
  artifactKind: "message" | "pdf" | "script";
  formatLabel: string;
  approvalChecklist: string[];
  evidence: string[];
  openItems: string[];
}

type DraftFormat =
  | "concise_touch"
  | "meeting_confirm"
  | "review_followup"
  | "formal_note"
  | "client_review_pack"
  | "tax_loss_harvesting"
  | "earnings_analysis"
  | "phone_opener"
  | "maturity_reminder"
  | "meeting_scheduling";

interface DraftFormatConfig {
  label?: string;
  artifactKind?: DraftAssistOutput["artifactKind"];
  approval?: "auto" | "client_artifact";
  prompt?: string;
  whatsapp?: {
    template?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class DraftAssistClient implements CopilotClient {
  constructor(private readonly requestedRuntime?: CopilotRuntime) {}

  async run(request: CopilotRunRequest, context: CopilotContext): Promise<CopilotRunResponse> {
    if (!context.customer) {
      return {
        ok: false,
        status: 400,
        code: "customer_required",
        reason: "Draft assist requires a customer context."
      };
    }

    const startedAt = new Date();
    const llm = getLLM(undefined, context.modelRoute);
    const ruleOutput = buildDraftOutput(context);
    const system = [
      "You are Dyna Beacon's draft assistant for wealth relationship managers.",
      "Use only the supplied Beacon context. Do not invent client facts.",
      "Prepare a draft only. Do not advise, recommend, decide, or tell the client what they should do.",
      "Use natural client language. Avoid internal workflow words in the client-facing draft.",
      "Do not put these terms in the client-facing draft: talking points, touchpoint, evidence trail, trace, Beacon, approval checklist, RM workflow.",
      `Copilot posture is ${context.posture}: conservative = shorter and evidence-first; balanced = include useful context; forward = surface more open items but keep approval language.`,
      "Follow the channel format in the user payload. WhatsApp must be one compact client message: 2-4 short lines, no subject, no email closing, no bullet list, no markdown, no emoji, no product promise, and one soft timing question at the end. Email must include a subject. Phone call must use opener, context, and close sections.",
      "Client Review Pack merges client report and financial plan into one artifact. It may summarize relationship context, portfolio snapshot, lifecycle items, planning questions, and next service steps, but must not make investment decisions.",
      "Tax opportunity scan may identify items for RM and tax professional review, but must not give tax advice.",
      "Earnings/lifecycle analysis should be tied to product maturity, quarterly review, or annual review context.",
      "Return JSON only with keys: headline, why, channel, subject, draft, artifactText, artifactKind, formatLabel, approvalChecklist, evidence, openItems.",
      "Client-facing report PDFs, tax scans, earnings/lifecycle PDFs, and portfolio change proposals need review-before-use. Routine check-ins, appointment confirmations, and phone scripts are auto-approved after RM review."
    ].join("\n");
    const user = buildLLMUserPrompt(request, context, ruleOutput);
    const completion = await llm.complete(system, user, {
      mockText: JSON.stringify(ruleOutput),
      temperature: 0.32,
      maxTokens: 1000
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
    const parsedOutput = parseDraftOutput(completion.text);
    const output = normalizeDraftOutput(parsedOutput ?? ruleOutput, context, ruleOutput);
    const draftFormat = normalizeDraftFormat(context.uiContext?.format);
    const guard = applyVocabularyGuardToOutput(output);
    const finishedAt = new Date();
    const runId = `run_${request.module}_${context.customer.customerId}_${Date.now()}`;
    const channel = output.channel === "whatsapp" ? "whatsapp" : output.channel === "call_script" ? "talking_points" : "email";
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
          note: "Posture nudges wording density only; approval and suitability rules do not change."
        }
      },
      {
        name: "Apply draft-assist rules",
        source: "BeaconRules",
        output: {
          channel: output.channel,
          format: formatLabel(draftFormat),
          artifactKind: output.artifactKind,
          approvalItems: output.approvalChecklist.length,
          openItems: output.openItems.length
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
      channel,
      moduleId: request.module,
      requestedRuntime: context.runtimeOverride ?? this.requestedRuntime ?? "skill-direct",
      backend: "skill-direct",
      model: completion.model,
      llmProvider: completion.llmProvider,
      skillVersion: "draft-assist@phase4-step4",
      state: "prepared",
      approvalRequired: approvalForDraft(draftFormat, context.roleAtRun),
      why: composeInlineWhy(steps),
      vocabularyAdjusted: guard.vocabularyAdjusted,
      cached: false,
      workflowId: "skill_direct_draft_assist",
      personaId: "asia-wealth-rm",
      customerId: context.customer.customerId,
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

function buildDraftOutput(context: CopilotContext): DraftAssistOutput {
  const customer = context.customer;
  if (!customer) throw new Error("Customer context is required.");

  const channel = normalizeDraftChannel(context.uiContext?.channel);
  const holdings = context.holdings ?? [];
  const products = context.products ?? [];
  const transactions = context.transactions ?? [];
  const lifecycleEvents = context.lifecycleEvents ?? [];
  const compliance = getRiskComplianceSummary(customer, holdings, products);
  const review = getReviewStatus(customer.nextReviewDate);
  const draftFormat = normalizeDraftFormat(context.uiContext?.format);
  const approvalRequired = approvalForDraft(draftFormat, context.roleAtRun);
  const topHolding = [...holdings].sort((a, b) => b.value - a.value)[0];
  const topProduct = products.find((product) => product.productId === topHolding?.productId);
  const reason = getPriorityReason(customer);
  const intent = context.intent || "prepare a client draft";
  const clientFocus = extractClientFocus(context.personalization.rmCustomInput || intent);
  const greeting = `Dear ${customer.name.split(" ")[0]},`;
  const closing = channel === "call_script" ? "Pause for client context, then use the supporting details." : `Regards,\n${context.actor.name}`;
  const formatName = formatLabel(draftFormat);
  const artifactKind = artifactKindForDraft(draftFormat);
  const draft =
    channel === "call_script"
      ? buildPhoneScript({
          draftFormat,
          reason,
          reviewLabel: review.label,
          lastContact: formatRelativeDays(customer.lastContactedAt).toLowerCase(),
          topProductName: topProduct?.name,
          topProductCategory: topProduct?.category,
          complianceState: compliance.worst,
          closing
        })
      : channel === "whatsapp"
        ? buildWhatsAppDraft({
            customerFirstName: customer.name.split(" ")[0],
            draftFormat,
            reason,
            reviewLabel: review.label,
            topProductName: topProduct?.name,
            clientFocus
          })
      : buildEmailDraft({
          greeting,
          closing,
          draftFormat,
          reason,
          reviewLabel: review.label,
          topProductName: topProduct?.name,
          topProductCategory: topProduct?.category,
          clientFocus
        });

  return {
    headline: `Prepared ${formatName} ${artifactKind === "pdf" ? "PDF" : labelForChannel(channel)} for ${customer.name}`,
    why: `${getPriorityTier(customer.priorityScore)} priority, ${review.label.toLowerCase()}, ${compliance.worst} compliance state, and ${formatName} format shaped this ${labelForChannel(channel)} output.`,
    channel,
    subject: channel === "email" ? emailSubjectFor(draftFormat) : undefined,
    draft: cleanClientFacingDraft(draft, channel),
    artifactText:
      artifactKind === "pdf"
        ? buildPdfArtifactText({
            customerName: customer.name,
            format: draftFormat,
            formatName,
            reason,
            reviewLabel: review.label,
            topProductName: topProduct?.name,
            topProductCategory: topProduct?.category,
            holdingsCount: holdings.length,
            transactionsCount: transactions.length,
            lifecycleCount: lifecycleEvents.length,
            riskProfile: customer.riskProfile,
            fundingCurrency: customer.fundingCurrency,
            complianceState: compliance.worst
          })
        : undefined,
    artifactKind,
    formatLabel: formatName,
    approvalChecklist: [
      `Review status: ${review.label}`,
      `Suitability/K&E evidence: ${compliance.worst}`,
      approvalRequired === "auto"
        ? "Routine client service note; no manager approval required."
        : `${formatName}; manager review required before sending.`
    ],
    evidence: [
      `Priority reason: ${reason}`,
      `Loaded ${holdings.length} holdings, ${transactions.length} transactions, ${lifecycleEvents.length} lifecycle signals.`,
      `Funding currency: ${customer.fundingCurrency}; risk profile: ${customer.riskProfile}.`
    ],
    openItems: [
      context.personalization.rmCustomInput || intent,
      compliance.worst === "Pass" ? "Confirm final wording before sending." : "Inspect compliance dimensions before sending."
    ]
  };
}

function buildLLMUserPrompt(request: CopilotRunRequest, context: CopilotContext, ruleOutput: DraftAssistOutput) {
  const customer = context.customer;
  return JSON.stringify({
    module: request.module,
    intent: request.intent,
    channel: normalizeDraftChannel(context.uiContext?.channel),
    format: normalizeDraftFormat(context.uiContext?.format),
    formatRules: getDraftFormatRules(normalizeDraftChannel(context.uiContext?.channel), normalizeDraftFormat(context.uiContext?.format)),
    rmPersonalization: context.personalization,
    customer: customer
      ? {
          customerId: customer.customerId,
          name: customer.name,
          serviceTier: customer.serviceTier,
          riskProfile: customer.riskProfile,
          priorityTier: getPriorityTier(customer.priorityScore),
          priorityReason: getPriorityReason(customer),
          lastContactedAt: customer.lastContactedAt,
          nextReviewDate: customer.nextReviewDate,
          reviewStatus: getReviewStatus(customer.nextReviewDate).label,
          fundingCurrency: customer.fundingCurrency,
          knowledgeAssessmentStatus: customer.knowledgeAssessmentStatus,
          suitabilityExpiresAt: customer.suitabilityExpiresAt
        }
      : undefined,
    holdings: context.holdings?.slice(0, 6),
    lifecycleEvents: context.lifecycleEvents?.slice(0, 5),
    recentTransactions: context.transactions?.slice(0, 5),
    ruleScaffold: ruleOutput,
    sourceRefs: context.sourceRefs
  });
}

function parseDraftOutput(text: string): DraftAssistOutput | undefined {
  const parsed = parseJsonObject(text);
  if (!parsed) return undefined;
  const headline = stringValue(parsed.headline);
  const why = stringValue(parsed.why);
  const channel = normalizeDraftChannel(parsed.channel);
  const draft = stringValue(parsed.draft);
  if (!headline || !why || !draft) return undefined;
  return {
    headline,
    why,
    channel,
    subject: stringValue(parsed.subject),
    draft,
    artifactText: stringValue(parsed.artifactText),
    artifactKind: parseArtifactKind(parsed.artifactKind),
    formatLabel: stringValue(parsed.formatLabel) ?? "Draft",
    approvalChecklist: stringArray(parsed.approvalChecklist).slice(0, 6),
    evidence: stringArray(parsed.evidence).slice(0, 6),
    openItems: stringArray(parsed.openItems).slice(0, 5)
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

function normalizeDraftChannel(value: unknown): DraftAssistOutput["channel"] {
  if (value === "whatsapp") return "whatsapp";
  if (value === "call_script") return "call_script";
  return "email";
}

function normalizeDraftFormat(value: unknown): DraftFormat {
  if (value === "meeting_confirm") return "meeting_confirm";
  if (value === "review_followup") return "review_followup";
  if (value === "formal_note") return "formal_note";
  if (value === "client_review_pack") return "client_review_pack";
  if (value === "tax_loss_harvesting") return "tax_loss_harvesting";
  if (value === "earnings_analysis") return "earnings_analysis";
  if (value === "phone_opener") return "phone_opener";
  if (value === "maturity_reminder") return "maturity_reminder";
  if (value === "meeting_scheduling") return "meeting_scheduling";
  return "concise_touch";
}

function normalizeDraftOutput(output: DraftAssistOutput, context: CopilotContext, fallback: DraftAssistOutput): DraftAssistOutput {
  const channel = normalizeDraftChannel(context.uiContext?.channel);
  const next: DraftAssistOutput = {
    ...output,
    channel,
    artifactKind: artifactKindForDraft(normalizeDraftFormat(context.uiContext?.format)),
    formatLabel: formatLabel(normalizeDraftFormat(context.uiContext?.format)),
    subject: channel === "email" ? output.subject ?? fallback.subject : undefined
  };

  if (channel === "whatsapp") {
    next.draft = cleanWhatsAppDraft(output.draft, fallback.draft);
  } else {
    next.draft = cleanClientFacingDraft(output.draft, channel);
  }
  if (next.artifactKind === "pdf" && !next.artifactText) {
    next.artifactText = fallback.artifactText ?? fallback.draft;
  }

  return next;
}

function buildWhatsAppDraft({
  customerFirstName,
  draftFormat,
  reason,
  reviewLabel,
  topProductName,
  clientFocus
}: {
  customerFirstName: string;
  draftFormat: DraftFormat;
  reason: string;
  reviewLabel: string;
  topProductName?: string;
  clientFocus?: string;
}) {
  const signal = shortReason(reason);
  const template = getWhatsAppTemplate(draftFormat);
  if (template.length > 0) {
    return template
      .map((line) =>
        line
          .replaceAll("{firstName}", customerFirstName)
          .replaceAll("{signal}", signal)
          .replaceAll("{reviewLabel}", reviewLabel)
          .replaceAll("{topProductName}", topProductName ?? "the portfolio")
      )
      .join("\n");
  }
  return [
    `Hi ${customerFirstName},`,
    `Quick note: I am preparing a short update around ${signal}.`,
    clientFocus ? formatClientFocusLine(clientFocus) : "I will bring the latest supporting details before we speak.",
    "Would a quick call this week work?"
  ].join("\n");
}

function buildPhoneScript({
  draftFormat,
  reason,
  reviewLabel,
  lastContact,
  topProductName,
  topProductCategory,
  complianceState,
  closing
}: {
  draftFormat: DraftFormat;
  reason: string;
  reviewLabel: string;
  lastContact: string;
  topProductName?: string;
  topProductCategory?: string;
  complianceState: string;
  closing: string;
}) {
  const productLine = topProductName
    ? `${topProductName}${topProductCategory ? ` (${topProductCategory})` : ""}`
    : "the current portfolio";
  if (draftFormat === "maturity_reminder") {
    return [
      "Opener: I am calling with a timing reminder on an upcoming maturity or review item.",
      `Context: ${reason}; review status is ${reviewLabel}; last contact was ${lastContact}.`,
      `Detail to prepare: ${productLine}.`,
      "Close: Ask whether the client would like to review options in the next meeting.",
      closing
    ].join("\n");
  }
  if (draftFormat === "meeting_scheduling") {
    return [
      "Opener: I am calling to find a convenient time for the next review conversation.",
      `Context: ${reason}; current review status is ${reviewLabel}.`,
      "Close: Offer two possible windows and ask which timing works best.",
      closing
    ].join("\n");
  }
  if (draftFormat === "meeting_confirm") {
    return [
      "Opener: I am calling to confirm whether the planned review time still works.",
      `Context: I will prepare the latest portfolio summary and ${reviewLabel.toLowerCase()} context before the meeting.`,
      "Close: Ask whether the client wants any specific topic included.",
      closing
    ].join("\n");
  }
  return [
    `Opener: ${reason}`,
    `Context: review status is ${reviewLabel}; last contact was ${lastContact}.`,
    `Portfolio note: ${productLine}.`,
    `Control point: ${complianceState} compliance state stays visible before any client-facing action.`,
    closing
  ].join("\n");
}

function cleanWhatsAppDraft(draft: string, fallback: string) {
  const cleaned = draft
    .replace(/^subject:.*$/gim, "")
    .replace(/^\s*Dear\s+/i, "Hi ")
    .replace(/\*\*/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^regards\b/i.test(line))
    .filter((line) => !/^your relationship manager\b/i.test(line))
    .filter((line) => !/approval required|before client-facing use/i.test(line))
    .filter((line) => !/^(opening|evidence|close|subject):/i.test(line))
    .map((line) => cleanInternalTerms(line))
    .slice(0, 4)
    .join("\n");
  if (!cleaned) return fallback;
  return cleaned.length > 520 ? `${cleaned.slice(0, 517).trim()}...` : cleaned;
}

function shortReason(reason: string) {
  return reason.replace(/\s+/g, " ").slice(0, 96).replace(/[.,;:\s]+$/, "");
}

function getDraftFormatRules(channel: DraftAssistOutput["channel"], format: DraftFormat) {
  const configured = getFormatConfig(format);
  if (channel === "whatsapp") {
    return configured?.whatsapp ?? {
      format,
      maxLines: 4,
      style: "natural WhatsApp client check-in",
      forbidden: ["subject line", "email closing", "long paragraphs"],
      required: ["client-first greeting", "one evidence-led reason", "soft timing question"]
    };
  }
  if (channel === "call_script") {
    return {
      format,
      label: configured?.label,
      prompt: configured?.prompt,
      sections: ["Opening", "Context", "Close"],
      style: "RM phone preparation script"
    };
  }
  return {
    format,
    label: configured?.label,
    prompt: configured?.prompt,
    artifactKind: configured?.artifactKind,
    sections: ["Subject", "Greeting", "Context", "Evidence", "Close"],
    style: format === "formal_note" ? "portfolio change proposal" : "client-ready note"
  };
}

function formatLabel(format: DraftFormat) {
  const configured = getFormatConfig(format);
  if (configured?.label) return configured.label;
  if (format === "meeting_confirm") return "meeting-check";
  if (format === "review_followup") return "review-follow-up";
  if (format === "formal_note") return "portfolio-change-proposal";
  if (format === "client_review_pack") return "client-review-pack";
  if (format === "tax_loss_harvesting") return "tax-opportunity-scan";
  if (format === "earnings_analysis") return "earnings-lifecycle-analysis";
  if (format === "phone_opener") return "phone-opener";
  if (format === "maturity_reminder") return "maturity-reminder";
  if (format === "meeting_scheduling") return "meeting-scheduling";
  return "short-touch";
}

function getWhatsAppTemplate(format: DraftFormat) {
  const template = getFormatConfig(format)?.whatsapp?.template;
  return Array.isArray(template) ? template.filter((line): line is string => typeof line === "string") : [];
}

function labelForChannel(channel: DraftAssistOutput["channel"]) {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "call_script") return "phone call";
  return "email";
}

function approvalForDraft(format: DraftFormat, role: AgentRun["roleAtRun"]): AgentRun["approvalRequired"] {
  if (getFormatConfig(format)?.approval !== "client_artifact") return "auto";
  return role === "Manager" ? "rm-approval" : "manager-approval";
}

function emailSubjectFor(format: DraftFormat) {
  if (format === "meeting_confirm") return "Confirming our upcoming appointment";
  if (format === "review_followup") return "Following up on your portfolio review";
  if (format === "formal_note") return "Portfolio changes for your review";
  if (format === "client_review_pack") return "Client Review Pack for your review";
  if (format === "tax_loss_harvesting") return "Tax-aware portfolio scan for review";
  if (format === "earnings_analysis") return "Portfolio lifecycle update for your review";
  return "Checking in before your next review";
}

function artifactKindForDraft(format: DraftFormat): DraftAssistOutput["artifactKind"] {
  const configured = getFormatConfig(format)?.artifactKind;
  return configured === "pdf" || configured === "script" || configured === "message" ? configured : "message";
}

function getFormatConfig(format: DraftFormat): DraftFormatConfig | undefined {
  return (rulesConfig.draft_assist.formats as Record<string, DraftFormatConfig | undefined>)[format];
}

function buildEmailDraft({
  greeting,
  closing,
  draftFormat,
  reason,
  reviewLabel,
  topProductName,
  topProductCategory,
  clientFocus
}: {
  greeting: string;
  closing: string;
  draftFormat: DraftFormat;
  reason: string;
  reviewLabel: string;
  topProductName?: string;
  topProductCategory?: string;
  clientFocus?: string;
}) {
  const productLine = topProductName
    ? `${topProductName}${topProductCategory ? ` (${topProductCategory})` : ""}`
    : "your current portfolio";
  const focusLine = clientFocus ? formatClientFocusLine(clientFocus) : undefined;
  if (draftFormat === "meeting_confirm") {
    return [
      greeting,
      "",
      "I hope you are well. I am writing to confirm whether our upcoming review time still works for you.",
      `I will prepare the latest portfolio summary and include the current review status: ${reviewLabel}.`,
      focusLine,
      "Please let me know if there is anything specific you would like covered.",
      "",
      closing
    ].filter(Boolean).join("\n");
  }
  if (draftFormat === "review_followup") {
    return [
      greeting,
      "",
      "I hope you are well. I am following up on your portfolio review and will prepare a short summary for your records.",
      `One item I will include is the latest context around ${productLine}, alongside the current review status: ${reviewLabel}.`,
      focusLine,
      "If there is a preferred time for a short discussion, please let me know.",
      "",
      closing
    ].filter(Boolean).join("\n");
  }
  if (draftFormat === "formal_note") {
    return [
      greeting,
      "",
      "I am preparing a short portfolio change proposal for your review, based on the latest information we hold for your account.",
      `One point I would like to review with you is ${reason.toLowerCase()}. I will include the relevant context for ${productLine}, including how it compares with your recorded risk profile and liquidity needs.`,
      focusLine,
      "No change will be placed until you have reviewed the proposal, provided instructions, and the required internal review is complete.",
      "",
      closing
    ].filter(Boolean).join("\n");
  }
  if (draftFormat === "client_review_pack") {
    return [
      greeting,
      "",
      "I am preparing a Client Review Pack for your review before our next discussion.",
      `The pack will cover your relationship context, a portfolio snapshot, recent activity, and any planning questions connected to ${productLine}.`,
      `I will also include the current review status: ${reviewLabel}.`,
      focusLine,
      "Please let me know if there is any topic you would like added before I finalize the PDF.",
      "",
      closing
    ].filter(Boolean).join("\n");
  }
  if (draftFormat === "tax_loss_harvesting") {
    return [
      greeting,
      "",
      "I am preparing a tax-aware portfolio scan for review.",
      `The scan will identify positions or recent activity that may be worth checking with the relevant tax professional, including the current context around ${productLine}.`,
      focusLine,
      "This is not tax advice; it is a preparation note so we can decide what should be reviewed further.",
      "",
      closing
    ].filter(Boolean).join("\n");
  }
  if (draftFormat === "earnings_analysis") {
    return [
      greeting,
      "",
      "I am preparing a short earnings and lifecycle update for your review.",
      `The update will cover current portfolio context around ${productLine}, any upcoming maturity or review items, and the current review status: ${reviewLabel}.`,
      focusLine,
      "Please let me know if there is a specific holding or date you would like me to include.",
      "",
      closing
    ].filter(Boolean).join("\n");
  }
  return [
    greeting,
    "",
    "I hope you are well. I am checking in ahead of your next review and wanted to see whether there is anything you would like me to focus on.",
    `I will prepare the latest portfolio summary and note the current review status: ${reviewLabel}.`,
    focusLine,
    "Would a short call later this week work for you?",
    "",
    closing
  ].filter(Boolean).join("\n");
}

function buildPdfArtifactText({
  customerName,
  format,
  formatName,
  reason,
  reviewLabel,
  topProductName,
  topProductCategory,
  holdingsCount,
  transactionsCount,
  lifecycleCount,
  riskProfile,
  fundingCurrency,
  complianceState
}: {
  customerName: string;
  format: DraftFormat;
  formatName: string;
  reason: string;
  reviewLabel: string;
  topProductName?: string;
  topProductCategory?: string;
  holdingsCount: number;
  transactionsCount: number;
  lifecycleCount: number;
  riskProfile: string;
  fundingCurrency: string;
  complianceState: string;
}) {
  const productLine = topProductName
    ? `${topProductName}${topProductCategory ? ` (${topProductCategory})` : ""}`
    : "current portfolio holdings";
  if (format === "tax_loss_harvesting") {
    return [
      `${formatName}`,
      `Client: ${customerName}`,
      "",
      "Purpose",
      "Prepare a tax-aware scan for RM review and, where appropriate, client discussion with a qualified tax professional.",
      "",
      "Portfolio context",
      `Primary item to inspect: ${productLine}.`,
      `Loaded context: ${holdingsCount} holdings, ${transactionsCount} recent transactions, ${lifecycleCount} lifecycle signals.`,
      "",
      "Review items",
      `- Current service signal: ${reason}.`,
      `- Review status: ${reviewLabel}.`,
      `- Funding currency: ${fundingCurrency}.`,
      "",
      "Boundaries",
      "This scan is not tax advice. It identifies items for further review only."
    ].join("\n");
  }
  if (format === "earnings_analysis") {
    return [
      `${formatName}`,
      `Client: ${customerName}`,
      "",
      "Lifecycle context",
      `Current service signal: ${reason}.`,
      `Review status: ${reviewLabel}.`,
      "",
      "Portfolio relevance",
      `Primary item to inspect: ${productLine}.`,
      `Risk profile on record: ${riskProfile}.`,
      "",
      "Questions for RM",
      "- Is there a maturity, quarterly review, or annual review event to confirm?",
      "- Should the client receive a brief before the next conversation?",
      "- Are any compliance dimensions in watch or block state?"
    ].join("\n");
  }
  return [
    `${formatName}`,
    `Client: ${customerName}`,
    "",
    "Relationship context",
    `Current service signal: ${reason}.`,
    `Review status: ${reviewLabel}.`,
    "",
    "Portfolio snapshot",
    `Primary item to inspect: ${productLine}.`,
    `Loaded context: ${holdingsCount} holdings, ${transactionsCount} recent transactions, ${lifecycleCount} lifecycle signals.`,
    `Risk profile: ${riskProfile}. Funding currency: ${fundingCurrency}.`,
    "",
    "Planning questions",
    "- Have objectives, liquidity needs, or family context changed?",
    "- Are any review or lifecycle items due before the next meeting?",
    "- Does the current portfolio context need an internal alignment check?",
    "",
    "Governance",
    `Compliance state: ${complianceState}. This pack is prepared for review-before-use.`
  ].join("\n");
}

function cleanClientFacingDraft(draft: string, channel: DraftAssistOutput["channel"]) {
  const cleaned = draft
    .split(/\r?\n/)
    .map((line) => cleanInternalTerms(line))
    .filter((line) => !/approval checklist/i.test(line))
    .join("\n")
    .trim();
  if (channel === "whatsapp") return cleaned;
  return cleaned;
}

function formatClientFocusLine(clientFocus: string) {
  return clientFocus.toLowerCase().startsWith("whether")
    ? `I will also check ${clientFocus}.`
    : `I will also include ${clientFocus}.`;
}

function cleanInternalTerms(line: string) {
  return line
    .replace(/\btalking points?\b/gi, "discussion notes")
    .replace(/\btouching point\b/gi, "check-in")
    .replace(/\btouchpoints?\b/gi, "check-in")
    .replace(/\bevidence trail\b/gi, "supporting details")
    .replace(/\btrace\b/gi, "review")
    .replace(/\bBeacon\b/g, "we")
    .replace(/\bRM workflow\b/gi, "service process")
    .replace(/\bsurface\b/gi, "share");
}

function extractClientFocus(value: string) {
  const cleaned = cleanInternalTerms(value)
    .replace(/^please\s+/i, "")
    .replace(/^include\s+/i, "")
    .replace(/\bprepare\b/gi, "")
    .replace(/\bclient email draft\b/gi, "")
    .replace(/\bwhatsapp\b/gi, "")
    .replace(/\bask whether\b/gi, "whether")
    .replace(/\bask if\b/gi, "whether")
    .replace(/\bneeds changed\b/gi, "needs have changed")
    .replace(/\bfor rm review\b/gi, "")
    .replace(/\bapproval-aware\b/gi, "")
    .replace(/\bclient-friendly\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.。]+$/, "");
  if (!cleaned || cleaned.length < 12) return undefined;
  if (/^(a|an|the)?\s*(concise|short|formal|portfolio change proposal|email|note)\b/i.test(cleaned)) {
    return undefined;
  }
  return cleaned.length > 140 ? `${cleaned.slice(0, 137).trim()}...` : cleaned;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function parseArtifactKind(value: unknown): DraftAssistOutput["artifactKind"] {
  return value === "pdf" || value === "script" || value === "message" ? value : "message";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatLlmError(error: unknown) {
  if (!(error instanceof Error)) return "LLM request failed";
  const cause = (error as Error & { cause?: unknown }).cause;
  if (isRecord(cause)) {
    const code = typeof cause.code === "string" ? cause.code : undefined;
    const hostname = typeof cause.hostname === "string" ? cause.hostname : undefined;
    if (code || hostname) return [error.message, code, hostname].filter(Boolean).join(" | ");
  }
  return error.message;
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
      uiContext: context.uiContext,
      sourceRefs: context.sourceRefs
    }))
    .digest("hex")
    .slice(0, 16);
}
