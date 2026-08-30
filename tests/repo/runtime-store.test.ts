import test from "node:test";
import assert from "node:assert/strict";
import type { AuditEvent } from "../../lib/repo/types";

test("runtime store falls back to memory when Redis is unreachable", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalWarn = console.warn;

  process.env.UPSTASH_REDIS_REST_URL = "https://unreachable.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  console.warn = () => undefined;

  try {
    const store = await import(`../../lib/repo/runtime-store.ts?fallback=${Date.now()}`);
    const event: AuditEvent = {
      eventId: "event_redis_fallback",
      type: "session.started",
      actorId: "rm_junior_01",
      actorRole: "Junior",
      timestamp: "2026-08-30T14:00:00.000Z",
      payload: { source: "test" }
    };

    await assert.doesNotReject(store.pushRuntimeAudit(event));
    assert.deepEqual(await store.getRuntimeAudit(), [event]);
    assert.equal(await store.incrementRuntimeCounter("beacon:test:fallback", 60), 1);
    assert.equal(await store.incrementRuntimeCounter("beacon:test:fallback", 60), 2);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    restoreEnv("UPSTASH_REDIS_REST_URL", originalUrl);
    restoreEnv("UPSTASH_REDIS_REST_TOKEN", originalToken);
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
