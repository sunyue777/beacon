export const accessCookieName = "beacon_access";
export const accessCookieMaxAge = 7 * 24 * 60 * 60;

export function getConfiguredAccessCode() {
  const value = process.env.BEACON_ACCESS_CODE?.trim();
  return value || undefined;
}

export async function hashAccessCode(code: string) {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function isValidAccessCookie(cookieValue: string | undefined, accessCode: string) {
  if (!cookieValue) {
    return false;
  }
  const expected = await hashAccessCode(accessCode);
  return constantTimeEqual(cookieValue, expected);
}

export function safeRelativePath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/login";
  }
  return value;
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
