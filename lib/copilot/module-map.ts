import type { CopilotModule, CopilotModuleConfig } from "@/lib/agent-studio/types";

export const copilotModuleMap = {
  talking_points: {
    module: "talking_points",
    label: "Talking points",
    description: "Prepare concise meeting or call points from customer context and evidence.",
    surfaces: ["workspace", "client-360"],
    notImplemented: false,
    runtime: "skill-direct",
    allowedRuntimeOverrides: ["skill-direct", "agent-studio", "open-agent"],
    provenance: "sourceRefs-only",
    reasoning: "inline-why",
    bounding: "vocabulary-guard",
    approval: "auto",
    reproducibility: "cached"
  },
  term_explainer: {
    module: "term_explainer",
    label: "Term explainer",
    description: "Explain products, terms, structures, and risk language for RM comprehension.",
    surfaces: ["client-360-holdings", "client-360-activity"],
    notImplemented: false,
    runtime: "skill-direct",
    allowedRuntimeOverrides: ["skill-direct", "agent-studio", "open-agent"],
    provenance: "sourceRefs-only",
    reasoning: "trace-only",
    bounding: "vocabulary-guard",
    approval: "auto",
    reproducibility: "cached"
  },
  next_best_action: {
    module: "next_best_action",
    label: "Next best action",
    description: "Surface the next service action without advisory or decision language.",
    surfaces: ["client-book", "client-360"],
    notImplemented: false,
    runtime: "deterministic",
    allowedRuntimeOverrides: ["deterministic", "skill-direct", "agent-studio", "open-agent"],
    provenance: "sourceRefs-only",
    reasoning: "inline-why",
    bounding: "vocabulary-guard",
    approval: "auto",
    reproducibility: "deterministic"
  },
  draft_assist: {
    module: "draft_assist",
    label: "Draft assist",
    description: "Prepare Email, WhatsApp, or Phone call outputs. Client-facing PDFs and portfolio change proposals require review-before-use.",
    surfaces: ["client-book-row", "client-360"],
    notImplemented: false,
    runtime: "skill-direct",
    allowedRuntimeOverrides: ["skill-direct", "agent-studio", "open-agent"],
    provenance: "sourceRefs-only",
    reasoning: "inline-why",
    bounding: "vocabulary-guard",
    approval: "rm-approval",
    reproducibility: "cached"
  }
} satisfies Record<CopilotModule, CopilotModuleConfig>;

export function getCopilotModuleConfig(module: CopilotModule): CopilotModuleConfig {
  return copilotModuleMap[module];
}
