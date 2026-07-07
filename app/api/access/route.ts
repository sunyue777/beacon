import { NextResponse } from "next/server";
import {
  accessCookieMaxAge,
  accessCookieName,
  getConfiguredAccessCode,
  hashAccessCode,
  isValidAccessCookie,
  safeRelativePath
} from "@/lib/auth/access-gate";

export async function POST(request: Request) {
  const accessCode = getConfiguredAccessCode();
  if (!accessCode) {
    return redirectWithAccess(request, "/login");
  }

  const { code, next } = await readAccessPayload(request);
  const target = safeRelativePath(next);
  const submitted = code.trim();
  const submittedHash = submitted ? await hashAccessCode(submitted) : undefined;

  if (await isValidAccessCookie(submittedHash, accessCode)) {
    const response = redirectWithAccess(request, target);
    response.cookies.set(accessCookieName, await hashAccessCode(accessCode), {
      httpOnly: true,
      maxAge: accessCookieMaxAge,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  }

  if (isJsonRequest(request)) {
    return NextResponse.json({ ok: false, reason: "access could not be verified" }, { status: 401 });
  }

  const accessUrl = new URL("/access", request.url);
  accessUrl.searchParams.set("error", "1");
  accessUrl.searchParams.set("next", target);
  return NextResponse.redirect(accessUrl, { status: 303 });
}

async function readAccessPayload(request: Request) {
  if (isJsonRequest(request)) {
    const payload = (await request.json().catch(() => ({}))) as { code?: unknown; next?: unknown };
    return {
      code: typeof payload.code === "string" ? payload.code : "",
      next: typeof payload.next === "string" ? payload.next : undefined
    };
  }

  const form = await request.formData();
  const code = form.get("code");
  const next = form.get("next");
  return {
    code: typeof code === "string" ? code : "",
    next: typeof next === "string" ? next : undefined
  };
}

function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

function redirectWithAccess(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}
