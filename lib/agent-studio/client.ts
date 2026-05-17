import type { CopilotClient, CopilotContext, CopilotRunRequest, CopilotRunResponse } from "@/lib/agent-studio/types";
import { getCopilotModuleConfig } from "@/lib/copilot/module-map";
import type { AgentRun } from "@/lib/repo/types";

export class NotConnectedError extends Error {
  constructor(message = "Agent Studio is not connected.") {
    super(message);
    this.name = "NotConnectedError";
  }
}

/**
 * Stubbed Agent Studio seat.
 *
 * Activation path: port the known Indivara Agent Studio API client into this
 * file, then map the response back to AgentRun. Until AS env/workflows are
 * configured, this client throws NotConnectedError so dispatch can fall back
 * without changing any frontend calls.
 */
export class AgentStudioClient implements CopilotClient {
  constructor(
    private readonly options: {
      agentIdentifier?: string;
      baseUrl?: string;
      apiKey?: string;
      runUrlTemplate?: string;
    } = {}
  ) {}

  async run(request: CopilotRunRequest, context: CopilotContext): Promise<CopilotRunResponse> {
    const baseUrl = this.options.baseUrl ?? process.env.AGENT_STUDIO_BASE_URL;
    const apiKey = this.options.apiKey ?? process.env.AGENT_STUDIO_API_KEY;
    const agentIdentifier = this.options.agentIdentifier;
    if (!baseUrl || !apiKey || !agentIdentifier) {
      throw new NotConnectedError("Agent Studio env or agent identifier is not configured.");
    }

    const startedAt = new Date();
    let response: Response;
    try {
      response = await fetch(buildRunUrl({
        baseUrl,
        runUrlTemplate: this.options.runUrlTemplate ?? process.env.AGENT_STUDIO_RUN_URL_TEMPLATE,
        agentIdentifier
      }), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          agentIdentifier,
          workflowId: agentIdentifier,
          module: request.module,
          intent: request.intent,
          input: buildAgentStudioInput(request, context)
        })
      });
    } catch (error) {
      throw new NotConnectedError(error instanceof Error ? error.message : "Agent Studio request failed.");
    }

    if (!response.ok) {
      throw new NotConnectedError(`Agent Studio request failed with ${response.status}.`);
    }

    const payload = (await response.json()) as AgentStudioPayload;
    const finishedAt = new Date();
    const run = mapAgentStudioPayloadToRun({
      payload,
      request,
      context,
      agentIdentifier,
      startedAt,
      finishedAt
    });
    return { ok: true, runId: run.runId, output: run };
  }
}

export function isNotConnectedError(error: unknown): error is NotConnectedError {
  return error instanceof NotConnectedError || (error instanceof Error && error.name === "NotConnectedError");
}

interface AgentStudioPayload {
  runId?: string;
  agentId?: string;
  workflowId?: string;
  model?: string;
  llmProvider?: string;
  output?: unknown;
  result?: unknown;
  text?: string;
  sourceRefs?: string[];
  steps?: AgentRun["steps"];
}

function buildAgentStudioInput(request: CopilotRunRequest, context: CopilotContext) {
  return {
    actor: context.actor,
    customer: context.customer
      ? {
          customerId: context.customer.customerId,
          name: context.customer.name,
          serviceTier: context.customer.serviceTier,
          segment: context.customer.segment,
          riskProfile: context.customer.riskProfile,
          priorityScore: context.customer.priorityScore,
          nextReviewDate: context.customer.nextReviewDate,
          lastContactedAt: context.customer.lastContactedAt
        }
      : undefined,
    personalization: context.personalization,
    posture: context.posture,
    uiContext: context.uiContext,
    sourceRefs: context.sourceRefs,
    counts: {
      accounts: context.accounts?.length ?? 0,
      holdings: context.holdings?.length ?? 0,
      transactions: context.transactions?.length ?? 0,
      lifecycleEvents: context.lifecycleEvents?.length ?? 0
    },
    holdings: context.holdings?.slice(0, 10),
    transactions: context.transactions?.slice(0, 8),
    lifecycleEvents: context.lifecycleEvents?.slice(0, 8),
    request: {
      module: request.module,
      intent: request.intent
    }
  };
}

function buildRunUrl({
  baseUrl,
  runUrlTemplate,
  agentIdentifier
}: {
  baseUrl: string;
  runUrlTemplate?: string;
  agentIdentifier: string;
}) {
  const trimmedBaseUrl = baseUrl.replace(/\/$/, "");
  const encodedIdentifier = encodeURIComponent(agentIdentifier);
  if (!runUrlTemplate) {
    return `${trimmedBaseUrl}/agents/${encodedIdentifier}/runs`;
  }

  if (/^https?:\/\//i.test(runUrlTemplate)) {
    return applyRunUrlTemplate(runUrlTemplate, encodedIdentifier);
  }

  return `${trimmedBaseUrl}/${applyRunUrlTemplate(runUrlTemplate.replace(/^\//, ""), encodedIdentifier)}`;
}

function applyRunUrlTemplate(template: string, encodedIdentifier: string) {
  return template
    .replaceAll("{agentId}", encodedIdentifier)
    .replaceAll("{agentIdentifier}", encodedIdentifier)
    .replaceAll("{workflowId}", encodedIdentifier);
}

function mapAgentStudioPayloadToRun({
  payload,
  request,
  context,
  agentIdentifier,
  startedAt,
  finishedAt
}: {
  payload: AgentStudioPayload;
  request: CopilotRunRequest;
  context: CopilotContext;
  agentIdentifier: string;
  startedAt: Date;
  finishedAt: Date;
}): AgentRun {
  const output = payload.output ?? payload.result ?? (payload.text ? { text: payload.text } : payload);
  const approval = getCopilotModuleConfig(request.module).approval;
  return {
    runId: payload.runId ?? `as_${request.module}_${context.customer?.customerId ?? "global"}_${finishedAt.getTime()}`,
    channel: mapAgentRunChannel(request, context),
    moduleId: request.module,
    requestedRuntime: "agent-studio",
    backend: "agent-studio",
    agentId: payload.agentId ?? agentIdentifier,
    workflowId: payload.workflowId ?? agentIdentifier,
    model: payload.model ?? "agent-studio",
    llmProvider: payload.llmProvider ?? "agent-studio",
    skillVersion: `${request.module}@agent-studio`,
    state: "prepared",
    approvalRequired: approvalForAgentStudioRun(request, context, approval),
    why: "Agent Studio returned a prepared output from the scoped Beacon context.",
    vocabularyAdjusted: false,
    cached: false,
    personaId: "asia-wealth-rm",
    customerId: context.customer?.customerId,
    rmId: context.actor.rmId,
    roleAtRun: context.roleAtRun,
    inputDigest: `${request.module}:${context.customer?.customerId ?? "global"}:${context.sourceRefs.length}`,
    sourceRefs: payload.sourceRefs ?? context.sourceRefs,
    steps: payload.steps ?? [
      {
        name: "Run Agent Studio workflow",
        source: "AgentStudio",
        output: { agentIdentifier, sourceRefs: context.sourceRefs.length }
      }
    ],
    output,
    fallbackMode: false,
    redactionLevel: "Summary",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    latencyMs: finishedAt.getTime() - startedAt.getTime()
  };
}

function approvalForAgentStudioRun(
  request: CopilotRunRequest,
  context: CopilotContext,
  configuredApproval: AgentRun["approvalRequired"]
): AgentRun["approvalRequired"] {
  if (request.module !== "draft_assist") return configuredApproval;
  if (!["formal_note", "client_review_pack", "tax_loss_harvesting", "earnings_analysis"].includes(String(context.uiContext?.format))) return "auto";
  return context.roleAtRun === "Manager" ? "rm-approval" : "manager-approval";
}

function mapAgentRunChannel(request: CopilotRunRequest, context: CopilotContext): AgentRun["channel"] {
  if (request.module === "term_explainer") return "term_explainer";
  if (request.module === "next_best_action") return "nba";
  if (request.module === "draft_assist") {
    const channel = context.uiContext?.channel;
    if (channel === "whatsapp") return "whatsapp";
    if (channel === "call_script") return "talking_points";
    return "email";
  }
  return "talking_points";
}
