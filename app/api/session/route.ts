import { NextResponse } from "next/server";
import { getDemoAccountById } from "@/lib/auth/accounts";
import { getOptionalCurrentAccount } from "@/lib/auth/server-session";
import {
  createSessionCookieValue,
  expiredSessionCookieOptions,
  sessionCookieOptions
} from "@/lib/auth/session-cookie";
import { sessionCookieName } from "@/lib/auth/constants";
import { pushRuntimeAudit } from "@/lib/repo/runtime-store";
import type { AuditEvent } from "@/lib/repo/types";

export async function POST(request: Request) {
  let payload: { rmId?: unknown };
  try {
    payload = (await request.json()) as { rmId?: unknown };
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid json" }, { status: 400 });
  }

  if (typeof payload.rmId !== "string") {
    return NextResponse.json({ ok: false, reason: "invalid rm id" }, { status: 400 });
  }

  const account = getDemoAccountById(payload.rmId);
  if (!account) {
    return NextResponse.json({ ok: false, reason: "invalid rm id" }, { status: 400 });
  }

  const previous = await getOptionalCurrentAccount();
  const response = NextResponse.json({ ok: true, account: { rmId: account.rmId, role: account.role, name: account.name } });
  response.cookies.set(sessionCookieName, await createSessionCookieValue(account.rmId), sessionCookieOptions());

  try {
    const switched = previous && previous.rmId !== account.rmId;
    await pushRuntimeAudit({
      eventId: `session_${account.rmId}_${Date.now()}`,
      type: switched ? "session.switched" : "session.started",
      actorId: account.rmId,
      actorRole: account.role,
      timestamp: new Date().toISOString(),
      payload: switched
        ? { from: previous.role, fromRmId: previous.rmId }
        : { source: "demo-login" }
    } satisfies AuditEvent);
  } catch (error) {
    console.warn("Session audit event could not be persisted.", error);
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, "", expiredSessionCookieOptions());
  return response;
}
