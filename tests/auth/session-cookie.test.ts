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
