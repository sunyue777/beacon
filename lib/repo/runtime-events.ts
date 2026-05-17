import type { AgentRun, AuditEvent, Transcript } from "./types";

/**
 * Process-level ring buffer of audit events generated at runtime
 * (e.g. session.started fired by login or client-facing draft runs).
 *
 * Demo simplification: in production, audit must persist server-side
 * with retention guarantees. Here we keep up to 50 most recent events
 * in process memory so the workspace audit pulse can show real
 * session and approval evidence without breaking the local-json-only data
 * model. Stored on globalThis so Next.js dev hot reloads do not drop the
 * draft approval queue between a Junior submit and Manager review.
 */

const MAX_EVENTS = 50;

type RuntimeStore = {
  events: AuditEvent[];
  agentRuns: AgentRun[];
  transcripts: Transcript[];
};

const runtimeKey = "__dynaBeaconRuntimeStore";
const runtimeGlobal = globalThis as typeof globalThis & {
  [runtimeKey]?: RuntimeStore;
};

const store =
  runtimeGlobal[runtimeKey] ??
  (runtimeGlobal[runtimeKey] = {
    events: [],
    agentRuns: [],
    transcripts: []
  });

export function pushRuntimeAudit(event: AuditEvent) {
  store.events.unshift(event);
  if (store.events.length > MAX_EVENTS) {
    store.events.length = MAX_EVENTS;
  }
}

export function getRuntimeAudit(): AuditEvent[] {
  return [...store.events];
}

export function clearRuntimeAudit() {
  store.events.length = 0;
}

export function pushRuntimeAgentRun(run: AgentRun) {
  store.agentRuns.unshift(run);
  if (store.agentRuns.length > MAX_EVENTS) {
    store.agentRuns.length = MAX_EVENTS;
  }
}

export function getRuntimeAgentRuns(): AgentRun[] {
  return [...store.agentRuns];
}

export function getRuntimeAgentRun(runId: string): AgentRun | undefined {
  return store.agentRuns.find((run) => run.runId === runId);
}

export function updateRuntimeAgentRun(runId: string, update: (run: AgentRun) => AgentRun): AgentRun | undefined {
  const index = store.agentRuns.findIndex((run) => run.runId === runId);
  if (index === -1) {
    return undefined;
  }
  const next = update(store.agentRuns[index]);
  store.agentRuns[index] = next;
  return next;
}

export function clearRuntimeAgentRuns() {
  store.agentRuns.length = 0;
}

export function pushRuntimeTranscript(transcript: Transcript) {
  store.transcripts.unshift(transcript);
  if (store.transcripts.length > MAX_EVENTS) {
    store.transcripts.length = MAX_EVENTS;
  }
}

export function getRuntimeTranscripts(): Transcript[] {
  return [...store.transcripts];
}

export function clearRuntimeTranscripts() {
  store.transcripts.length = 0;
}
