export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  mockText?: string;
}

export interface LLMCompletion {
  text: string;
  model: string;
  llmProvider: string;
  latencyMs: number;
  usage: LLMUsage;
}

export interface LLMClient {
  complete(system: string, user: string, opts?: LLMCompletionOptions): Promise<LLMCompletion>;
}
