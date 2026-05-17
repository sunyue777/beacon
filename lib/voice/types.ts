import type { AgentRun, RMRole, Transcript } from "@/lib/repo/types";

export type VoiceIntegrationMode = "web_call_simulator" | "dyna_voice_saas";
export type VoiceDirection = "outbound" | "inbound";

export type VoiceScenario =
  | "meeting_confirmation"
  | "maturity_reminder"
  | "authorization_prompt"
  | "inbound_rm_assist"
  | "post_call_follow_up";

export type VoiceCallStatus =
  | "draft"
  | "approval_required"
  | "ready"
  | "in_progress"
  | "completed"
  | "handoff_required"
  | "failed";

export interface VoiceCallIntent {
  intentId: string;
  scenario: VoiceScenario;
  direction: VoiceDirection;
  integrationMode: VoiceIntegrationMode;
  customerId?: string;
  rmId: string;
  roleAtIntent: RMRole;
  purpose: string;
  status: VoiceCallStatus;
  requiresApproval: boolean;
  sourceRefs: string[];
  createdAt: string;
}

export interface VoiceCallSession {
  sessionId: string;
  intentId?: string;
  externalCallId?: string;
  integrationMode: VoiceIntegrationMode;
  direction: VoiceDirection;
  customerId?: string;
  rmId: string;
  startedAt: string;
  endedAt?: string;
  status: VoiceCallStatus;
  transcriptId?: string;
  agentRunId?: string;
}

export interface VoiceRunResult {
  session: VoiceCallSession;
  transcript?: Transcript;
  agentRun?: AgentRun;
  actionItems: string[];
  followUpDraft?: {
    channel: "email" | "whatsapp";
    text: string;
    approvalRequired: AgentRun["approvalRequired"];
  };
}

export interface TelephonyAdapter {
  mode: VoiceIntegrationMode;
  createOutboundCall(intent: VoiceCallIntent): Promise<VoiceCallSession>;
  receiveInboundCall(session: VoiceCallSession): Promise<VoiceCallSession>;
  getTranscript(sessionId: string): Promise<Transcript | undefined>;
  requestRmHandoff(sessionId: string, reason: string): Promise<VoiceCallSession>;
}

export const voiceScenarioCatalog: Record<VoiceScenario, { direction: VoiceDirection; label: string; requiresApproval: boolean }> = {
  meeting_confirmation: {
    direction: "outbound",
    label: "Auto call to confirm meeting",
    requiresApproval: false
  },
  maturity_reminder: {
    direction: "outbound",
    label: "Maturity reminder call",
    requiresApproval: true
  },
  authorization_prompt: {
    direction: "outbound",
    label: "Authorization prompt call",
    requiresApproval: true
  },
  inbound_rm_assist: {
    direction: "inbound",
    label: "Assist RM when they are busy",
    requiresApproval: false
  },
  post_call_follow_up: {
    direction: "outbound",
    label: "Follow-up call after meeting",
    requiresApproval: true
  }
};
