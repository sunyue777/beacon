import { NextResponse } from "next/server";
import { getOptionalCurrentAccount } from "@/lib/auth/server-session";
import { getRepo } from "@/lib/repo";
import { pushRuntimeAgentRun, pushRuntimeAudit, pushRuntimeTranscript } from "@/lib/repo/runtime-store";
import type { AuditEvent } from "@/lib/repo/types";
import { runVoiceScenario } from "@/lib/voice/run";
import { voiceScenarioCatalog, type VoiceIntegrationMode, type VoiceScenario } from "@/lib/voice/types";

interface VoiceRunPayload {
  customerId?: unknown;
  scenario?: unknown;
  integrationMode?: unknown;
}

export async function POST(request: Request) {
  let payload: VoiceRunPayload;
  try {
    payload = (await request.json()) as VoiceRunPayload;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid json" }, { status: 400 });
  }

  if (typeof payload.customerId !== "string") {
    return NextResponse.json({ ok: false, reason: "customer id required" }, { status: 400 });
  }
  if (!isVoiceScenario(payload.scenario)) {
    return NextResponse.json({ ok: false, reason: "invalid voice scenario" }, { status: 400 });
  }
  if (!isVoiceIntegrationMode(payload.integrationMode)) {
    return NextResponse.json({ ok: false, reason: "invalid voice integration mode" }, { status: 400 });
  }

  const account = await getOptionalCurrentAccount();
  if (!account) {
    return NextResponse.json({ ok: false, reason: "missing session" }, { status: 401 });
  }

  const repo = getRepo();
  const canView = await repo.canViewCustomer(payload.customerId, { rmId: account.rmId, role: account.role });
  if (!canView) {
    return NextResponse.json({ ok: false, reason: "customer outside permission scope" }, { status: 403 });
  }
  const customer = await repo.getCustomer(payload.customerId);
  if (!customer) {
    return NextResponse.json({ ok: false, reason: "customer not found" }, { status: 404 });
  }

  const result = await runVoiceScenario({
    scenario: payload.scenario,
    integrationMode: payload.integrationMode,
    customer,
    actor: { rmId: account.rmId, name: account.name, role: account.role }
  });

  if (result.transcript) {
    await pushRuntimeTranscript(result.transcript);
  }
  if (result.agentRun) {
    await pushRuntimeAgentRun(result.agentRun);
  }
  await writeVoiceAudit({
    account,
    customerId: customer.customerId,
    runId: result.agentRun?.runId,
    scenario: payload.scenario,
    integrationMode: payload.integrationMode,
    transcriptId: result.transcript?.transcriptId,
    handoffRequired: result.transcript?.handoffRequired ?? false
  });

  return NextResponse.json({ ok: true, output: result });
}

function isVoiceScenario(value: unknown): value is VoiceScenario {
  return typeof value === "string" && value in voiceScenarioCatalog;
}

function isVoiceIntegrationMode(value: unknown): value is VoiceIntegrationMode {
  return value === "web_call_simulator" || value === "dyna_voice_saas";
}

async function writeVoiceAudit({
  account,
  customerId,
  handoffRequired,
  integrationMode,
  runId,
  scenario,
  transcriptId
}: {
  account: { rmId: string; role: AuditEvent["actorRole"] };
  customerId: string;
  handoffRequired: boolean;
  integrationMode: VoiceIntegrationMode;
  runId?: string;
  scenario: VoiceScenario;
  transcriptId?: string;
}) {
  const now = new Date().toISOString();
  const base = {
    actorId: account.rmId,
    actorRole: account.role,
    customerId,
    runId,
    timestamp: now,
    payload: {
      scenario,
      integrationMode,
      transcriptId,
      source: "api/voice/run"
    }
  };
  await pushRuntimeAudit({
    ...base,
    eventId: `voice_started_${account.rmId}_${Date.now()}`,
    type: "voice.call.started"
  } satisfies AuditEvent);
  await pushRuntimeAudit({
    ...base,
    eventId: `voice_completed_${account.rmId}_${Date.now()}`,
    type: "voice.call.completed"
  } satisfies AuditEvent);
  if (handoffRequired) {
    await pushRuntimeAudit({
      ...base,
      eventId: `voice_handoff_${account.rmId}_${Date.now()}`,
      type: "voice.handoff.required"
    } satisfies AuditEvent);
  }
}
