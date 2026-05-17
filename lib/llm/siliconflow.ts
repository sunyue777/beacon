import type { LLMClient, LLMCompletion, LLMCompletionOptions } from "@/lib/llm/types";

interface SiliconFlowChatResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class SiliconFlowLLMClient implements LLMClient {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl?: string;
      model?: string;
    }
  ) {}

  async complete(system: string, user: string, opts: LLMCompletionOptions = {}): Promise<LLMCompletion> {
    const started = Date.now();
    const baseUrl = (this.options.baseUrl || "https://api.siliconflow.cn/v1").replace(/\/$/, "");
    const model = this.options.model || "Qwen/Qwen3-32B";
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: opts.temperature ?? 0.35,
        max_tokens: opts.maxTokens ?? 900,
        stream: false
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`SiliconFlow request failed with ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`);
    }

    const payload = (await response.json()) as SiliconFlowChatResponse;
    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("SiliconFlow response did not include message content.");
    }

    return {
      text,
      model: payload.model ?? model,
      llmProvider: "siliconflow",
      latencyMs: Math.max(1, Date.now() - started),
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? estimateTokens(system) + estimateTokens(user),
        outputTokens: payload.usage?.completion_tokens ?? estimateTokens(text)
      }
    };
  }
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}
