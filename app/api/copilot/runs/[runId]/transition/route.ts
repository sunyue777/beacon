import { NextResponse } from "next/server";
import { getOptionalCurrentAccount } from "@/lib/auth/server-session";
import { auditTypeForTransition, canTransitionAgentRun, isAgentRunTransition } from "@/lib/copilot/approval";
import { getRepo } from "@/lib/repo";
import { getRuntimeAgentRun, pushRuntimeAgentRun, pushRuntimeAudit, updateRuntimeAgentRun } from "@/lib/repo/runtime-store";
import type { AgentRun, AuditEvent } from "@/lib/repo/types";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { runId } = await context.params;
  let payload: { transition?: unknown; note?: unknown; fourEyesWaived?: unknown };
  try {
    payload = (await request.json()) as { transition?: unknown; note?: unknown; fourEyesWaived?: unknown };
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid json" }, { status: 400 });
  }

  if (!isAgentRunTransition(payload.transition)) {
    return NextResponse.json({ ok: false, reason: "invalid transition" }, { status: 400 });
  }
  if (payload.note !== undefined && typeof payload.note !== "string") {
    return NextResponse.json({ ok: false, reason: "invalid note" }, { status: 400 });
  }
  if (payload.fourEyesWaived !== undefined && typeof payload.fourEyesWaived !== "boolean") {
    return NextResponse.json({ ok: false, reason: "invalid four-eyes waiver" }, { status: 400 });
  }

  const account = await getOptionalCurrentAccount();
  if (!account) {
    return NextResponse.json({ ok: false, reason: "missing session" }, { status: 401 });
  }

  let run = await getRuntimeAgentRun(runId);
  if (!run) {
    const repo = getRepo();
    const seededRun = (await repo.listAgentRuns()).find((item) => item.runId === runId);
    if (!seededRun) {
      return NextResponse.json({ ok: false, reason: "runtime run not found" }, { status: 404 });
    }
    run = normalizeSeedRunForApproval(seededRun);
    await pushRuntimeAgentRun(run);
  }

  if (run.customerId) {
    const repo = getRepo();
    const canView = await repo.canViewCustomer(run.customerId, { rmId: account.rmId, role: account.role });
    if (!canView) {
      return NextResponse.json({ ok: false, reason: "customer outside permission scope" }, { status: 403 });
    }
  }

  const fourEyesWaived = payload.fourEyesWaived === true;
  const allowed = canTransitionAgentRun(
    run,
    payload.transition,
    { rmId: account.rmId, role: account.role },
    { fourEyesWaived }
  );
  if (!allowed.ok) {
    return NextResponse.json({ ok: false, reason: allowed.reason }, { status: 409 });
  }

  const now = new Date().toISOString();
  const updated = await updateRuntimeAgentRun(runId, (current) => ({
    ...current,
    state: payload.transition as AgentRun["state"],
    steps: [
      ...current.steps,
      {
        name: "Approval state transition",
        source: "BeaconApproval",
        output: {
          from: current.state ?? "prepared",
          to: payload.transition,
          actorId: account.rmId,
          actorRole: account.role,
          fourEyes: fourEyesWaived ? "waived-demo" : undefined,
          note: typeof payload.note === "string" ? payload.note.slice(0, 600) : undefined,
          timestamp: now
        }
      }
    ]
  }));

  if (!updated) {
    return NextResponse.json({ ok: false, reason: "runtime run not found" }, { status: 404 });
  }

  await pushRuntimeAudit({
    eventId: `copilot_transition_${runId}_${Date.now()}`,
    type: auditTypeForTransition(payload.transition),
    actorId: account.rmId,
    actorRole: account.role,
    customerId: updated.customerId,
    runId,
    timestamp: now,
    payload: {
      transition: payload.transition,
      previousState: run.state ?? "prepared",
      nextState: updated.state,
      fourEyes: fourEyesWaived ? "waived-demo" : undefined,
      note: typeof payload.note === "string" ? payload.note.slice(0, 600) : undefined
    }
  } satisfies AuditEvent);

  return NextResponse.json({ ok: true, runId, output: updated });
}

function normalizeSeedRunForApproval(run: AgentRun): AgentRun {
  const moduleId = run.moduleId ?? "talking_points";
  return {
    ...run,
    moduleId,
    requestedRuntime: run.requestedRuntime ?? "deterministic",
    backend: run.backend ?? "deterministic",
    model: run.model ?? "demo-seed",
    llmProvider: run.llmProvider ?? "local-demo",
    skillVersion: run.skillVersion ?? "seed-run@v1",
    state: run.state ?? "prepared",
    approvalRequired:
      run.approvalRequired ?? (moduleId === "draft_assist" ? (run.roleAtRun === "Junior" ? "manager-approval" : "rm-approval") : "auto"),
    cached: run.cached ?? true,
    vocabularyAdjusted: run.vocabularyAdjusted ?? false
  };
}
