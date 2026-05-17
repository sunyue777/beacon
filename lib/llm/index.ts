import { MockLLMClient } from "@/lib/llm/mock";
import { SiliconFlowLLMClient } from "@/lib/llm/siliconflow";
import type { LLMClient } from "@/lib/llm/types";

export type BeaconLLMProvider = "mock" | "siliconflow" | "anthropic-claude" | "openai" | "bedrock" | "ollama";
export type BeaconModelRoute = "mock" | "siliconflow";

export function getLLM(provider: BeaconLLMProvider = getConfiguredProvider(), route?: BeaconModelRoute): LLMClient {
  if (route) {
    return getLLMForRoute(route);
  }

  if (provider === "mock") {
    return new MockLLMClient();
  }

  if (provider === "siliconflow") {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return new MockLLMClient();
    }
    return new SiliconFlowLLMClient({
      apiKey,
      baseUrl: process.env.SILICONFLOW_BASE_URL,
      model: process.env.SILICONFLOW_MODEL
    });
  }

  // Real providers are Phase 4.5+. Until then, keep the contract stable and
  // route unavailable providers through the mock client instead of breaking
  // local demos.
  return new MockLLMClient();
}

function getConfiguredProvider(): BeaconLLMProvider {
  const value = process.env.BEACON_LLM;
  if (value === "siliconflow" || value === "anthropic-claude" || value === "openai" || value === "bedrock" || value === "ollama") {
    return value;
  }
  return "mock";
}

function getLLMForRoute(route: BeaconModelRoute): LLMClient {
  if (route === "mock") {
    return new MockLLMClient();
  }

  if (route === "siliconflow") {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return new MockLLMClient();
    }
    return new SiliconFlowLLMClient({
      apiKey,
      baseUrl: process.env.SILICONFLOW_BASE_URL,
      model: process.env.SILICONFLOW_MODEL
    });
  }

  return new MockLLMClient();
}
