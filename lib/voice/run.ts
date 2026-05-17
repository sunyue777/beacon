import { createHash } from "node:crypto";
import { applyVocabularyGuardToOutput } from "@/lib/copilot/guard";
import { composeInlineWhy } from "@/lib/copilot/why";
import type { AgentRun, CustomerProfile, Transcript } from "@/lib/repo/types";
import { MockTelephonyAdapter } from "@/lib/voice/mock-adapter";
import { voiceScenarioCatalog, type VoiceCallIntent, type VoiceIntegrationMode, type VoiceRunResult, type VoiceScenario } from "@/lib/voice/types";

export interface RunVoiceOptions {
  scenario: VoiceScenario;
  integrationMode: VoiceIntegrationMode;
  customer: CustomerProfile;
  actor: { rmId: string; name: string; role: CustomerProfile["assignedRmTier"] };
}

export async function runVoiceScenario({
  actor,
  customer,
  integrationMode,
  scenario
}: RunVoiceOptions): Promise<VoiceRunResult> {
  const catalog = voiceScenarioCatalog[scenario];
  const adapter = new MockTelephonyAdapter();
  const createdAt = new Date().toISOString();
  const intent: VoiceCallIntent = {
    intentId: `voice_intent_${scenario}_${customer.customerId}_${Date.now()}`,
    scenario,
    direction: catalog.direction,
    integrationMode,
    customerId: customer.customerId,
    rmId: actor.rmId,
    roleAtIntent: actor.role,
    purpose: catalog.label,
    status: catalog.requiresApproval ? "approval_required" : "ready",
    requiresApproval: catalog.requiresApproval,
    sourceRefs: [`customer:${customer.customerId}`, "voice-scenario-catalog", "web-call-simulator"],
    createdAt
  };

  const session = catalog.direction === "outbound"
    ? await adapter.createOutboundCall(intent)
    : await adapter.receiveInboundCall({
        sessionId: `voice_session_inbound_${customer.customerId}_${Date.now()}`,
        integrationMode,
        direction: "inbound",
        customerId: customer.customerId,
        rmId: actor.rmId,
        startedAt: createdAt,
        status: "in_progress"
      });

  const transcript = await adapter.getTranscript(session.sessionId);
  const actionItems = buildActionItems(scenario, customer, transcript);
  const approvalRequirement: AgentRun["approvalRequired"] = catalog.requiresApproval || actor.role === "Junior"
    ? actor.role === "Junior"
      ? "manager-approval"
      : "rm-approval"
    : "auto";
  const followUpDraft = buildFollowUpDraft(scenario, customer, transcript, approvalRequirement, actor.name);
  const rawOutput = {
    headline: `${catalog.label} completed`,
    summary: transcript?.summary ?? "Voice session completed and post-call summary prepared.",
    scenario,
    integrationMode,
    direction: catalog.direction,
    transcriptId: transcript?.transcriptId,
    actionItems,
    followUpDraft,
    handoffRequired: transcript?.handoffRequired ?? false
  };
  const guard = applyVocabularyGuardToOutput(rawOutput);
  const startedAt = session.startedAt;
  const finishedAt = new Date().toISOString();
  const steps: AgentRun["steps"] = [
    {
      name: "Create voice intent",
      source: "BeaconVoice",
      output: {
        scenario,
        integrationMode,
        direction: catalog.direction,
        requiresApproval: catalog.requiresApproval
      }
    },
    {
      name: "Run telephony adapter",
      source: integrationMode === "dyna_voice_saas" ? "DynaVoiceSaaSAdapterStub" : "WebCallSimulator",
      output: {
        sessionId: session.sessionId,
        status: session.status,
        fallback: integrationMode === "dyna_voice_saas" ? "simulated until SaaS credentials are connected" : undefined
      }
    },
    {
      name: "ASR transcript capture",
      source: "MockASR",
      inputRef: transcript?.transcriptId,
      output: {
        turns: transcript?.turns.length ?? 0,
        handoffRequired: transcript?.handoffRequired ?? false
      }
    },
    {
      name: "Post-call summary",
      source: "BeaconVoiceRules",
      output: {
        actionItems: actionItems.length,
        followUpChannel: followUpDraft.channel
      }
    },
    ...(guard.step ? [guard.step] : [])
  ];

  const agentRun: AgentRun = {
    runId: `run_voice_${scenario}_${customer.customerId}_${Date.now()}`,
    channel: "post_call_summary",
    moduleId: "voice_mvp",
    requestedRuntime: "deterministic",
    backend: "deterministic",
    model: "beacon-voice-rules-v1",
    llmProvider: "local-rules",
    skillVersion: "voice-mvp@phase8",
    state: "prepared",
    approvalRequired: followUpDraft.approvalRequired,
    why: composeInlineWhy(steps),
    vocabularyAdjusted: guard.vocabularyAdjusted,
    cached: false,
    workflowId: "voice_mvp_post_call_summary",
    personaId: "asia-wealth-rm",
    customerId: customer.customerId,
    rmId: actor.rmId,
    roleAtRun: actor.role,
    inputDigest: digestVoiceInput({ scenario, integrationMode, customerId: customer.customerId, rmId: actor.rmId }),
    sourceRefs: intent.sourceRefs,
    steps,
    output: guard.output,
    fallbackMode: integrationMode === "dyna_voice_saas",
    redactionLevel: "Summary",
    startedAt,
    finishedAt,
    latencyMs: Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt))
  };

  return {
    session: { ...session, agentRunId: agentRun.runId },
    transcript,
    agentRun,
    actionItems,
    followUpDraft
  };
}

function buildActionItems(scenario: VoiceScenario, customer: CustomerProfile, transcript?: Transcript) {
  const base = [
    `Log voice summary against ${customer.name}.`,
    "Prepare supporting details before any client-facing follow-up."
  ];
  if (scenario === "meeting_confirmation") {
    return ["Confirm meeting time in RM calendar.", ...base, "Bring portfolio and review-date context to the meeting."];
  }
  if (scenario === "maturity_reminder") {
    return ["Check maturity date and linked holding.", ...base, "Prepare a short maturity reminder note for RM approval."];
  }
  if (scenario === "authorization_prompt") {
    return ["Open authorization checklist.", ...base, "Confirm required approval path before sending anything."];
  }
  if (scenario === "inbound_rm_assist") {
    return ["Notify RM that handoff is required.", ...base, transcript?.summary ?? "Review inbound call summary."];
  }
  return ["Prepare follow-up summary.", ...base, "Draft a concise post-call note for approval."];
}

function buildFollowUpDraft(
  scenario: VoiceScenario,
  customer: CustomerProfile,
  transcript: Transcript | undefined,
  approvalRequired: AgentRun["approvalRequired"],
  actorName: string
) {
  const firstName = customer.name.split(" ")[0];
  const channel: "email" | "whatsapp" = scenario === "meeting_confirmation" ? "whatsapp" : "email";
  const text = channel === "whatsapp"
    ? [
        `Hi ${firstName},`,
        "Thanks for confirming the review slot.",
        "I will prepare the supporting details before we speak.",
        "Please let me know if the timing changes."
      ].join("\n")
    : [
        `Subject: Follow-up from our call`,
        "",
        `Hi ${firstName},`,
        "",
        transcript?.summary ?? "I am preparing a short follow-up from our call.",
        "I will keep the relevant supporting details ready before any next step.",
        "",
        "Regards,",
        actorName
      ].join("\n");
  return {
    channel,
    text,
    approvalRequired
  };
}

function digestVoiceInput(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}
