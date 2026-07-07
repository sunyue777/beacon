import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { demoAccounts } from "@/lib/auth/accounts";
import { sessionCookieName } from "@/lib/auth/constants";
import { pushRuntimeAudit } from "@/lib/repo/runtime-store";
import type { AuditEvent, RMRole } from "@/lib/repo/types";

interface SessionPayload {
  type: "session.started" | "session.switched";
  rmId?: string;
  role?: RMRole;
  fromRmId?: string;
  fromRole?: RMRole;
}

/**
 * POST /api/audit/session
 *
 * Logs a session.started or session.switched event into the runtime audit
 * buffer. Production must persist these (with retention + access controls);
 * the demo keeps them in memory so the audit pulse reflects real activity.
 */
export async function POST(request: Request) {
  let payload: SessionPayload;
  try {
    payload = (await request.json()) as SessionPayload;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid json" }, { status: 400 });
  }

  if (payload?.type !== "session.started" && payload?.type !== "session.switched") {
    return NextResponse.json({ ok: false, reason: "invalid event type" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionRmId = cookieStore.get(sessionCookieName)?.value;
  const account = demoAccounts.find((item) => item.rmId === sessionRmId);
  if (!account) {
    return NextResponse.json({ ok: false, reason: "missing session" }, { status: 401 });
  }
  if (payload.rmId && payload.rmId !== account.rmId) {
    return NextResponse.json({ ok: false, reason: "session actor mismatch" }, { status: 403 });
  }
  if (payload.role && payload.role !== account.role) {
    return NextResponse.json({ ok: false, reason: "session role mismatch" }, { status: 403 });
  }

  const fromAccount = payload.fromRmId
    ? demoAccounts.find((item) => item.rmId === payload.fromRmId)
    : undefined;
  if (payload.fromRmId && !fromAccount) {
    return NextResponse.json({ ok: false, reason: "invalid previous actor" }, { status: 400 });
  }
  if (payload.fromRole && fromAccount && payload.fromRole !== fromAccount.role) {
    return NextResponse.json({ ok: false, reason: "invalid previous role" }, { status: 400 });
  }

  const event: AuditEvent = {
    eventId: `session_${account.rmId}_${Date.now()}`,
    type: payload.type,
    actorId: account.rmId,
    actorRole: account.role,
    timestamp: new Date().toISOString(),
    payload:
      payload.type === "session.switched"
        ? { from: fromAccount?.role ?? null, fromRmId: fromAccount?.rmId ?? null }
        : { source: "demo-login" }
  };
  await pushRuntimeAudit(event);

  return NextResponse.json({ ok: true, eventId: event.eventId });
}
