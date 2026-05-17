import type {
  Account,
  AgentRun,
  CustomerProfile,
  Holding,
  LifecycleEvent,
  MarketSnapshot,
  Product,
  RMRole,
  RMUser,
  Transaction
} from "@/lib/repo/types";

export type CopilotModule =
  | "talking_points"
  | "term_explainer"
  | "next_best_action"
  | "draft_assist";

export type CopilotRuntime =
  | "deterministic"
  | "skill-direct"
  | "agent-studio"
  | "open-agent";

export type CopilotModelRoute =
  | "mock"
  | "siliconflow";

export type CopilotPosture = "conservative" | "balanced" | "forward";

export type CopilotProvenance = "sourceRefs-only" | "inline-citations";
export type CopilotReasoning = "trace-only" | "inline-why";
export type CopilotBounding = "trust-prompt" | "vocabulary-guard";
export type CopilotApproval = "auto" | "rm-approval" | "manager-approval";
export type CopilotReproducibility = "deterministic" | "cached" | "best-effort";

export interface CopilotRunRequest {
  module: CopilotModule;
  customerId?: string;
  intent?: string;
  runtimeOverride?: CopilotRuntime;
  modelRoute?: CopilotModelRoute;
  personalization?: CopilotPersonalization;
  uiContext?: Record<string, unknown>;
}

export type CopilotRunResponse =
  | {
      ok: true;
      runId: string;
      output: AgentRun;
    }
  | {
      ok: false;
      reason: string;
      status: number;
      code?: string;
    };

export interface CopilotContext {
  module: CopilotModule;
  actor: Pick<RMUser, "rmId" | "name" | "role">;
  roleAtRun: RMRole;
  posture: CopilotPosture;
  intent?: string;
  runtimeOverride?: CopilotRuntime;
  modelRoute?: CopilotModelRoute;
  personalization: CopilotPersonalization;
  uiContext?: Record<string, unknown>;
  customer?: CustomerProfile;
  accounts?: Account[];
  holdings?: Holding[];
  products?: Product[];
  transactions?: Transaction[];
  lifecycleEvents?: LifecycleEvent[];
  marketSnapshot?: MarketSnapshot;
  sourceRefs: string[];
  requestedAt: string;
}

export interface CopilotPersonalization {
  /** Customer habits and preferences observed by the RM, e.g. channel, timing, decision style. */
  customerHabits: string[];
  /** One-off RM instruction for the current run. Kept server-side in the AgentRun trace. */
  rmCustomInput: string;
}

export interface CopilotClient {
  run(request: CopilotRunRequest, context: CopilotContext): Promise<CopilotRunResponse>;
}

export interface CopilotModuleConfig {
  module: CopilotModule;
  label: string;
  description: string;
  surfaces: string[];
  notImplemented: boolean;
  runtime: CopilotRuntime;
  allowedRuntimeOverrides: CopilotRuntime[];
  provenance: CopilotProvenance;
  reasoning: CopilotReasoning;
  bounding: CopilotBounding;
  approval: CopilotApproval;
  reproducibility: CopilotReproducibility;
}

export const copilotModules: CopilotModule[] = [
  "talking_points",
  "term_explainer",
  "next_best_action",
  "draft_assist"
];

export function isCopilotModule(value: unknown): value is CopilotModule {
  return typeof value === "string" && copilotModules.includes(value as CopilotModule);
}
