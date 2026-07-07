import { sessionCookieName } from "@/lib/auth/constants";

export const sessionCookieMaxAge = 30 * 24 * 60 * 60;

const sessionSecretWarningState = globalThis as typeof globalThis & {
  __beaconSessionDevSecretWarned__?: boolean;
};

export async function createSessionCookieValue(rmId: string) {
  return `${rmId}.${await signSessionValue(rmId)}`;
}

export async function verifySessionCookieValue(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const [rmId, signature, extra] = value.split(".");
  if (!rmId || !signature || extra !== undefined) {
    return undefined;
  }
  const expected = await signSessionValue(rmId);
  return constantTimeEqual(signature, expected) ? rmId : undefined;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: sessionCookieMaxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

export function expiredSessionCookieOptions() {
  return {
    ...sessionCookieOptions(),
    maxAge: 0
  };
}

async function signSessionValue(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getSessionSecret() {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production") {
    throw new Error("SESSION_SECRET is required to sign Beacon RM sessions.");
  }
  if (!sessionSecretWarningState.__beaconSessionDevSecretWarned__) {
    sessionSecretWarningState.__beaconSessionDevSecretWarned__ = true;
    console.warn("SESSION_SECRET is not set; using the local Beacon demo session secret.");
  }
  return "beacon-local-dev-session-secret";
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}
