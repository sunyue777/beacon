import type { LLMClient, LLMCompletion } from "@/lib/llm/types";

export class MockLLMClient implements LLMClient {
  async complete(system: string, user: string, opts: { mockText?: string } = {}): Promise<LLMCompletion> {
    const started = Date.now();
    const text = opts.mockText ?? "Prepared local mock output from Beacon rules.";
    return {
      text,
      model: "beacon-mock-v1",
      llmProvider: "mock",
      latencyMs: Math.max(1, Date.now() - started),
      usage: {
        inputTokens: estimateTokens(system) + estimateTokens(user),
        outputTokens: estimateTokens(text)
      }
    };
  }
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}
