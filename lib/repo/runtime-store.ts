import { Redis } from "@upstash/redis";
import type { AgentRun, AuditEvent, Transcript } from "./types";

const MAX_EVENTS = 50;
const TTL_SECONDS = 7 * 24 * 60 * 60;
const COUNTER_TTL_SECONDS = 48 * 60 * 60;

type RuntimeCollections = {
  events: AuditEvent[];
  agentRuns: AgentRun[];
  transcripts: Transcript[];
};

type RuntimeCounter = {
  value: number;
  expiresAt: number;
};

const runtimeKeys: Record<keyof RuntimeCollections, string> = {
  events: "beacon:runtime:events",
  agentRuns: "beacon:runtime:agentRuns",
  transcripts: "beacon:runtime:transcripts"
};

const runtimeKey = "__dynaBeaconRuntimeStore";
const runtimeGlobal = globalThis as typeof globalThis & {
  [runtimeKey]?: RuntimeCollections;
  __dynaBeaconRuntimeCounters?: Record<string, RuntimeCounter>;
};

const memoryStore =
  runtimeGlobal[runtimeKey] ??
  (runtimeGlobal[runtimeKey] = {
    events: [],
    agentRuns: [],
    transcripts: []
  });

const memoryCounters = runtimeGlobal.__dynaBeaconRuntimeCounters ?? (runtimeGlobal.__dynaBeaconRuntimeCounters = {});

let redisClient: Redis | null | undefined;

function getRedisClient() {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

async function readCollection<K extends keyof RuntimeCollections>(collection: K): Promise<RuntimeCollections[K]> {
  const redis = getRedisClient();
  if (!redis) {
    return [...memoryStore[collection]] as RuntimeCollections[K];
  }

  const raw = await redis.get<string | RuntimeCollections[K]>(runtimeKeys[collection]);
  if (!raw) {
    return [] as unknown as RuntimeCollections[K];
  }
  if (typeof raw === "string") {
    return JSON.parse(raw) as RuntimeCollections[K];
  }
  return raw;
}

async function writeCollection<K extends keyof RuntimeCollections>(collection: K, items: RuntimeCollections[K]) {
  const next = items.slice(0, MAX_EVENTS) as RuntimeCollections[K];
  const redis = getRedisClient();
  if (!redis) {
    memoryStore[collection] = next;
    return;
  }

  // Demo workload is tiny, so a simple read-modify-write is acceptable here.
  // Production should move this to atomic list operations or optimistic locking.
  await redis.set(runtimeKeys[collection], JSON.stringify(next), { ex: TTL_SECONDS });
}

async function pushCollection<K extends keyof RuntimeCollections>(
  collection: K,
  item: RuntimeCollections[K][number]
) {
  const items = await readCollection(collection);
  await writeCollection(collection, [item, ...items] as RuntimeCollections[K]);
}

export async function pushRuntimeAudit(event: AuditEvent) {
  await pushCollection("events", event);
}

export async function getRuntimeAudit(): Promise<AuditEvent[]> {
  return readCollection("events");
}

export async function clearRuntimeAudit() {
  await writeCollection("events", []);
}

export async function pushRuntimeAgentRun(run: AgentRun) {
  await pushCollection("agentRuns", run);
}

export async function getRuntimeAgentRuns(): Promise<AgentRun[]> {
  return readCollection("agentRuns");
}

export async function getRuntimeAgentRun(runId: string): Promise<AgentRun | null> {
  const runs = await readCollection("agentRuns");
  return runs.find((run) => run.runId === runId) ?? null;
}

export async function updateRuntimeAgentRun(
  runId: string,
  update: (run: AgentRun) => AgentRun
): Promise<AgentRun | null> {
  const runs = await readCollection("agentRuns");
  const index = runs.findIndex((run) => run.runId === runId);
  if (index === -1) {
    return null;
  }
  const next = update(runs[index]);
  runs[index] = next;
  await writeCollection("agentRuns", runs);
  return next;
}

export async function clearRuntimeAgentRuns() {
  await writeCollection("agentRuns", []);
}

export async function pushRuntimeTranscript(transcript: Transcript) {
  await pushCollection("transcripts", transcript);
}

export async function getRuntimeTranscripts(): Promise<Transcript[]> {
  return readCollection("transcripts");
}

export async function clearRuntimeTranscripts() {
  await writeCollection("transcripts", []);
}

export async function incrementRuntimeCounter(key: string, ttlSeconds = COUNTER_TTL_SECONDS): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    const count = await redis.incr(key);
    await redis.expire(key, ttlSeconds);
    return count;
  }

  const now = Date.now();
  const existing = memoryCounters[key];
  if (!existing || existing.expiresAt <= now) {
    memoryCounters[key] = {
      value: 1,
      expiresAt: now + ttlSeconds * 1000
    };
    return 1;
  }

  existing.value += 1;
  return existing.value;
}
