import assert from "node:assert/strict";
import test from "node:test";
import { createSessionCookieValue, verifySessionCookieValue } from "@/lib/auth/session-cookie";

test("session cookie round-trips a signed RM id", async () => {
  process.env.SESSION_SECRET = "test-session-secret";
  const value = await createSessionCookieValue("rm_mid_01");

  assert.equal(await verifySessionCookieValue(value), "rm_mid_01");
});

test("session cookie rejects unsigned or tampered values", async () => {
  process.env.SESSION_SECRET = "test-session-secret";
  const value = await createSessionCookieValue("rm_mid_01");
  const tamperedRm = value.replace("rm_mid_01", "rm_manager_01");
  const tamperedSignature = `${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}`;

  assert.equal(await verifySessionCookieValue("rm_manager_01"), undefined);
  assert.equal(await verifySessionCookieValue(tamperedRm), undefined);
  assert.equal(await verifySessionCookieValue(tamperedSignature), undefined);
});

test("session cookie still works in Vercel production when SESSION_SECRET is not configured", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVercelEnv = process.env.VERCEL_ENV;

  delete process.env.SESSION_SECRET;
  setEnv("NODE_ENV", "production");
  setEnv("VERCEL_ENV", "production");

  try {
    const value = await createSessionCookieValue("rm_mid_01");
    assert.equal(await verifySessionCookieValue(value), "rm_mid_01");
  } finally {
    restoreEnv("SESSION_SECRET", previousSecret);
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("VERCEL_ENV", previousVercelEnv);
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function setEnv(key: string, value: string) {
  process.env[key] = value;
}
