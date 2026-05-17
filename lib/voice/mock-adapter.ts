import type { Transcript } from "@/lib/repo/types";
import type { TelephonyAdapter, VoiceCallIntent, VoiceCallSession } from "@/lib/voice/types";

const transcripts = new Map<string, Transcript>();

export class MockTelephonyAdapter implements TelephonyAdapter {
  mode = "web_call_simulator" as const;

  async createOutboundCall(intent: VoiceCallIntent): Promise<VoiceCallSession> {
    const now = new Date();
    const session: VoiceCallSession = {
      sessionId: `voice_session_${intent.scenario}_${Date.now()}`,
      intentId: intent.intentId,
      externalCallId: `webcall_${intent.scenario}_${Date.now()}`,
      integrationMode: intent.integrationMode,
      direction: intent.direction,
      customerId: intent.customerId,
      rmId: intent.rmId,
      startedAt: now.toISOString(),
      endedAt: new Date(now.getTime() + 6 * 60_000).toISOString(),
      status: "completed"
    };
    const transcript = buildTranscript(session, intent);
    transcripts.set(session.sessionId, transcript);
    return { ...session, transcriptId: transcript.transcriptId };
  }

  async receiveInboundCall(session: VoiceCallSession): Promise<VoiceCallSession> {
    const now = new Date();
    const next: VoiceCallSession = {
      ...session,
      startedAt: session.startedAt || now.toISOString(),
      endedAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      status: "handoff_required"
    };
    const intent: VoiceCallIntent = {
      intentId: next.intentId ?? `voice_intent_inbound_${Date.now()}`,
      scenario: "inbound_rm_assist",
      direction: "inbound",
      integrationMode: next.integrationMode,
      customerId: next.customerId,
      rmId: next.rmId,
      roleAtIntent: "MidLevel",
      purpose: "Assist RM when busy and capture follow-up actions.",
      status: "handoff_required",
      requiresApproval: false,
      sourceRefs: ["web-call-simulator"],
      createdAt: next.startedAt
    };
    const transcript = buildTranscript(next, intent);
    transcripts.set(next.sessionId, transcript);
    return { ...next, transcriptId: transcript.transcriptId };
  }

  async getTranscript(sessionId: string): Promise<Transcript | undefined> {
    return transcripts.get(sessionId);
  }

  async requestRmHandoff(sessionId: string, reason: string): Promise<VoiceCallSession> {
    const transcript = transcripts.get(sessionId);
    return {
      sessionId,
      integrationMode: transcript?.integrationMode ?? "web_call_simulator",
      direction: transcript?.channel === "voice_inbound" ? "inbound" : "outbound",
      customerId: transcript?.customerId,
      rmId: transcript?.rmId ?? "unknown",
      startedAt: transcript?.startedAt ?? new Date().toISOString(),
      endedAt: transcript?.endedAt,
      status: "handoff_required",
      transcriptId: transcript?.transcriptId,
      externalCallId: reason
    };
  }
}

function buildTranscript(session: VoiceCallSession, intent: VoiceCallIntent): Transcript {
  const startedAt = session.startedAt;
  const endedAt = session.endedAt ?? new Date(Date.parse(startedAt) + 5 * 60_000).toISOString();
  const inbound = intent.direction === "inbound";
  const summary = summaryForScenario(intent);
  return {
    transcriptId: `voice_tx_${session.sessionId}`,
    customerId: intent.customerId ?? "unknown",
    rmId: intent.rmId,
    channel: inbound ? "voice_inbound" : "voice_outbound",
    scenario: intent.scenario,
    integrationMode: intent.integrationMode,
    externalCallId: session.externalCallId,
    handoffRequired: inbound,
    startedAt,
    endedAt,
    summary,
    turns: [
      {
        speaker: "system",
        text: inbound
          ? "Beacon answered the inbound call because the RM was busy."
          : `Beacon placed a simulated outbound call for ${intent.purpose}.`,
        timestamp: startedAt
      },
      {
        speaker: "customer",
        text: customerLineForScenario(intent),
        timestamp: new Date(Date.parse(startedAt) + 75_000).toISOString()
      },
      {
        speaker: "rm",
        text: "The RM will review the supporting details and follow up with a prepared note.",
        timestamp: new Date(Date.parse(startedAt) + 190_000).toISOString()
      },
      {
        speaker: "system",
        text: inbound
          ? "Handoff required: customer asked for RM confirmation."
          : "Call completed: action items and follow-up draft prepared.",
        timestamp: endedAt
      }
    ]
  };
}

function summaryForScenario(intent: VoiceCallIntent) {
  if (intent.scenario === "meeting_confirmation") {
    return "Client confirmed a short review slot and asked the RM to prepare the supporting details.";
  }
  if (intent.scenario === "maturity_reminder") {
    return "Client acknowledged the upcoming maturity and asked for a concise follow-up note before discussion.";
  }
  if (intent.scenario === "authorization_prompt") {
    return "Client requested a clear authorization checklist before taking the next step.";
  }
  if (intent.scenario === "inbound_rm_assist") {
    return "Beacon captured an inbound service question while the RM was busy and marked handoff required.";
  }
  return "Post-call follow-up captured next actions and a client-ready draft for RM review.";
}

function customerLineForScenario(intent: VoiceCallIntent) {
  if (intent.scenario === "meeting_confirmation") {
    return "Yes, a quick review slot works. Please bring the latest portfolio context.";
  }
  if (intent.scenario === "maturity_reminder") {
    return "Thanks for the reminder. Please send a short note with the maturity date and options to discuss.";
  }
  if (intent.scenario === "authorization_prompt") {
    return "Please clarify what approval or authorization is required before I confirm anything.";
  }
  if (intent.scenario === "inbound_rm_assist") {
    return "I need help understanding whether my upcoming review date has changed.";
  }
  return "Please send me a short follow-up with the key items we discussed.";
}
