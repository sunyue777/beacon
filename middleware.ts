import { NextResponse, type NextRequest } from "next/server";
import { accessCookieName, getConfiguredAccessCode, isValidAccessCookie } from "@/lib/auth/access-gate";

const publicPrefixes = [
  "/access",
  "/api/access",
  "/_next",
  "/favicon",
  "/images",
  "/brand"
];

export async function middleware(request: NextRequest) {
  const accessCode = getConfiguredAccessCode();
  if (!accessCode) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasAccess = await isValidAccessCookie(request.cookies.get(accessCookieName)?.value, accessCode);
  if (hasAccess) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, reason: "access required" }, { status: 401 });
  }

  const accessUrl = new URL("/access", request.url);
  accessUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(accessUrl);
}

function isPublicPath(pathname: string) {
  return publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"]
};
