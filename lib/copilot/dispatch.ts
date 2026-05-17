import type { CopilotClient, CopilotModule, CopilotRunRequest, CopilotRunResponse, CopilotContext, CopilotRuntime } from "@/lib/agent-studio/types";
import { AgentStudioClient, isNotConnectedError } from "@/lib/agent-studio/client";
import { DraftAssistClient } from "@/lib/copilot/draft-assist";
import { getCopilotModuleConfig } from "@/lib/copilot/module-map";
import { NextBestActionClient } from "@/lib/copilot/next-best-action";
import { TermExplainerClient } from "@/lib/copilot/term-explainer";
import { TalkingPointsClient } from "@/lib/copilot/talking-points";

class NotImplementedCopilotClient implements CopilotClient {
  constructor(private readonly module: CopilotModule) {}

  async run(_request: CopilotRunRequest, _context: CopilotContext): Promise<CopilotRunResponse> {
    const config = getCopilotModuleConfig(this.module);
    return {
      ok: false,
      status: 501,
      code: "copilot_module_not_implemented",
      reason: `${config.label} is registered in the Phase 4 module map, but its runtime is not connected yet.`
    };
  }
}

class FallbackCopilotClient implements CopilotClient {
  constructor(
    private readonly primary: CopilotClient,
    private readonly fallback: CopilotClient
  ) {}

  async run(request: CopilotRunRequest, context: CopilotContext): Promise<CopilotRunResponse> {
    try {
      return await this.primary.run(request, context);
    } catch (error) {
      if (isNotConnectedError(error)) {
        return this.fallback.run(request, context);
      }
      throw error;
    }
  }
}

export function getClient(module: CopilotModule, runtimeOverride?: CopilotRuntime): CopilotClient {
  const config = getCopilotModuleConfig(module);
  if (config.notImplemented) {
    return new NotImplementedCopilotClient(module);
  }

  if (module === "talking_points") {
    if (runtimeOverride === "agent-studio") {
      return new FallbackCopilotClient(
        new AgentStudioClient({ agentIdentifier: getAgentStudioIdentifier("TALKING_POINTS") }),
        new TalkingPointsClient(runtimeOverride)
      );
    }
    return new TalkingPointsClient(runtimeOverride);
  }

  if (module === "draft_assist") {
    if (runtimeOverride === "agent-studio") {
      return new FallbackCopilotClient(
        new AgentStudioClient({ agentIdentifier: getAgentStudioIdentifier("DRAFT_ASSIST") }),
        new DraftAssistClient(runtimeOverride)
      );
    }
    return new DraftAssistClient(runtimeOverride);
  }

  if (module === "term_explainer") {
    if (runtimeOverride === "agent-studio") {
      return new FallbackCopilotClient(
        new AgentStudioClient({ agentIdentifier: getAgentStudioIdentifier("TERM_EXPLAINER") }),
        new TermExplainerClient(runtimeOverride)
      );
    }
    return new TermExplainerClient(runtimeOverride);
  }

  if (module === "next_best_action") {
    return new NextBestActionClient();
  }

  return new NotImplementedCopilotClient(module);
}

function getAgentStudioIdentifier(moduleEnvName: string) {
  return process.env[`AGENT_STUDIO_AGENT_${moduleEnvName}`] ?? process.env[`AGENT_STUDIO_WF_${moduleEnvName}`];
}
