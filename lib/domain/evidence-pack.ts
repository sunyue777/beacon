import type { AgentRun, AuditEvent, CustomerProfile, RMRole, RMUser } from "@/lib/repo/types";

export type EvidenceTone = "ai" | "muted" | "success" | "warning" | "danger";

export interface EvidenceTimelineItem {
  key: string;
  label: string;
  timestamp: string;
  actorName: string;
  actorRole?: RMRole;
  note?: string;
  tone: EvidenceTone;
}

export interface EvidencePack {
  kind: "draft" | "trace";
  title: string;
  customerName: string;
  customerSlug: string;
  rmName: string;
  rmRole?: RMRole;
  reviewerName?: string;
  reviewerRole?: RMRole;
  exportedAt: string;
  generatedAt?: string;
  channelLabel: string;
  formatLabel?: string;
  subject?: string;
  body: string;
  timeline: EvidenceTimelineItem[];
  governance: {
    guardLabel: string;
    approvalLabel: string;
    approvalChain: string[];
    ruleChecks: string[];
    sourceRefs: string[];
  };
  appendix: { label: string; value: string }[];
}

export interface EvidencePackInput {
  kind?: "draft" | "trace";
  title?: string;
  run?: AgentRun;
  customer?: Pick<CustomerProfile, "customerId" | "name" | "rmId" | "assignedRmTier">;
  customerName?: string;
  rmName?: string;
  rmRole?: RMRole;
  reviewerName?: string;
  reviewerRole?: RMRole;
  events?: AuditEvent[];
  rms?: RMUser[];
  exportedAt?: string;
}

const draftEventTypes = new Set<AuditEvent["type"]>([
  "draft.created",
  "draft.edited",
  "draft.approved",
  "draft.rejected",
  "draft.discarded",
  "draft.sent"
]);

export function buildEvidencePack(input: EvidencePackInput): EvidencePack {
  const run = input.run;
  const output = isRecord(run?.output) ? run.output : {};
  const customerName = input.customer?.name ?? input.customerName ?? "Current client";
  const actor = resolveRm(input.rms, run?.rmId ?? input.customer?.rmId);
  const rmName = input.rmName ?? actor?.name ?? "Relationship manager";
  const rmRole = input.rmRole ?? actor?.role ?? run?.roleAtRun ?? input.customer?.assignedRmTier;
  const events = filterRunEvents(input.events ?? [], run);
  const reviewer = resolveReviewer(events, input.rms, input.reviewerName, input.reviewerRole);
  const kind = input.kind ?? (run?.moduleId === "draft_assist" || output.draft ? "draft" : "trace");
  const timeline = buildEvidenceTimeline({ events, run, rms: input.rms, rmName, rmRole });
  const body = formatOutputBody(output, customerName);
  const subject = stringValue(output.subject);
  const formatLabel = stringValue(output.formatLabel) ?? stringValue(output.headline);
  const channelLabel = channelLabelFor(stringValue(output.channel) ?? run?.channel);

  return {
    kind,
    title: input.title ?? (kind === "draft" ? "Draft evidence pack" : "AI trace evidence"),
    customerName,
    customerSlug: slugifyName(customerName),
    rmName,
    rmRole,
    reviewerName: reviewer.name,
    reviewerRole: reviewer.role,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    generatedAt: run?.finishedAt,
    channelLabel,
    formatLabel,
    subject,
    body,
    timeline,
    governance: {
      guardLabel: run?.vocabularyAdjusted
        ? "Vocabulary guard adjusted client wording before review."
        : "Vocabulary guard recorded no client wording changes.",
      approvalLabel: approvalLabelFor(run?.approvalRequired, kind),
      approvalChain: buildApprovalChain(timeline, rmName, reviewer.name),
      ruleChecks: buildRuleChecks(run, output, kind),
      sourceRefs: sanitizeSourceRefs(run?.sourceRefs ?? [])
    },
    appendix: buildAppendix(run)
  };
}

export function buildEvidenceTimeline({
  events,
  run,
  rms,
  rmName,
  rmRole
}: {
  events: AuditEvent[];
  run?: AgentRun;
  rms?: RMUser[];
  rmName?: string;
  rmRole?: RMRole;
}): EvidenceTimelineItem[] {
  const draftEvents = events
    .filter((event) => draftEventTypes.has(event.type))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (draftEvents.length > 0) {
    return draftEvents.map((event, index) => {
      const actor = resolveRm(rms, event.actorId);
      return {
        key: event.eventId || `${event.type}-${index}`,
        label: labelForEventType(event.type),
        timestamp: event.timestamp,
        actorName: actor?.name ?? actorNameFor(event.actorId, event.actorRole, rmName),
        actorRole: actor?.role ?? event.actorRole,
        note: noteForEvent(event),
        tone: toneForEventType(event.type)
      };
    });
  }

  const stepTransitions = (run?.steps ?? [])
    .map((step, index) => ({ step, index, output: isRecord(step.output) ? step.output : undefined }))
    .filter(({ output }) => typeof output?.to === "string" && typeof output?.timestamp === "string");

  if (stepTransitions.length > 0) {
    return stepTransitions.map(({ output, index }) => {
      const actor = resolveRm(rms, stringValue(output?.actorId));
      const label = labelForState(stringValue(output?.to));
      return {
        key: `step-transition-${index}`,
        label,
        timestamp: stringValue(output?.timestamp) ?? run?.finishedAt ?? new Date().toISOString(),
        actorName: actor?.name ?? actorNameFor(stringValue(output?.actorId), asRole(output?.actorRole), rmName),
        actorRole: actor?.role ?? asRole(output?.actorRole),
        note: stringValue(output?.note),
        tone: toneForState(stringValue(output?.to))
      };
    });
  }

  if (!run) return [];

  return [
    {
      key: "run-started",
      label: "Prepared",
      timestamp: run.startedAt,
      actorName: rmName ?? "Relationship manager",
      actorRole: rmRole ?? run.roleAtRun,
      note: "Beacon gathered customer context and service signals.",
      tone: "ai"
    },
    {
      key: "run-reviewed",
      label: "Evidence checked",
      timestamp: run.finishedAt,
      actorName: rmName ?? "Relationship manager",
      actorRole: rmRole ?? run.roleAtRun,
      note: "Governance checks and source references were retained.",
      tone: "muted"
    },
    {
      key: "run-output",
      label: "Output ready",
      timestamp: run.finishedAt,
      actorName: rmName ?? "Relationship manager",
      actorRole: rmRole ?? run.roleAtRun,
      note: "Prepared output is available with trace evidence.",
      tone: "success"
    }
  ];
}

export function getLatestDraftEvents(events: AuditEvent[]) {
  const latest = new Map<string, AuditEvent>();
  for (const event of events
    .filter((item) => Boolean(item.runId) && draftEventTypes.has(item.type))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    latest.set(event.runId ?? event.eventId, event);
  }
  return [...latest.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getHandledDraftEvents(events: AuditEvent[]) {
  return getLatestDraftEvents(events).filter((event) => event.type === "draft.sent" || event.type === "draft.rejected");
}

export function slugifyName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "client";
}

function filterRunEvents(events: AuditEvent[], run?: AgentRun) {
  if (!run?.runId) return events;
  return events.filter((event) => event.runId === run.runId);
}

function resolveReviewer(events: AuditEvent[], rms?: RMUser[], fallbackName?: string, fallbackRole?: RMRole) {
  const reviewerEvent = events.find((event) =>
    event.type === "draft.approved" || event.type === "draft.rejected" || event.type === "draft.sent"
  );
  const reviewer = reviewerEvent ? resolveRm(rms, reviewerEvent.actorId) : undefined;
  return {
    name: fallbackName ?? reviewer?.name,
    role: fallbackRole ?? reviewer?.role ?? reviewerEvent?.actorRole
  };
}

function resolveRm(rms: RMUser[] | undefined, rmId: string | undefined) {
  if (!rmId) return undefined;
  return rms?.find((rm) => rm.rmId === rmId);
}

function actorNameFor(actorId: string | undefined, role: RMRole | undefined, fallback?: string) {
  if (fallback) return fallback;
  if (role === "Manager") return "Manager reviewer";
  if (role === "Junior") return "Junior RM";
  if (role === "MidLevel") return "Relationship manager";
  return actorId ? "Beacon user" : "Beacon";
}

function labelForEventType(type: AuditEvent["type"]) {
  switch (type) {
    case "draft.created":
      return "Created";
    case "draft.edited":
      return "Edited";
    case "draft.approved":
      return "Approved";
    case "draft.rejected":
      return "Returned";
    case "draft.discarded":
      return "Deleted";
    case "draft.sent":
      return "Sent";
    default:
      return "Recorded";
  }
}

function labelForState(state: string | undefined) {
  if (state === "rejected") return "Returned";
  if (state === "approved") return "Approved";
  if (state === "edited") return "Edited";
  if (state === "discarded") return "Deleted";
  if (state === "sent") return "Sent";
  return "Recorded";
}

function toneForEventType(type: AuditEvent["type"]): EvidenceTone {
  if (type === "draft.rejected") return "warning";
  if (type === "draft.discarded") return "danger";
  if (type === "draft.approved" || type === "draft.sent") return "success";
  if (type === "draft.created") return "ai";
  return "muted";
}

function toneForState(state: string | undefined): EvidenceTone {
  if (state === "rejected") return "warning";
  if (state === "discarded") return "danger";
  if (state === "approved" || state === "sent") return "success";
  if (state === "edited") return "ai";
  return "muted";
}

function noteForEvent(event: AuditEvent) {
  const note = stringValue(event.payload?.note);
  if (note) return note;
  switch (event.type) {
    case "draft.created":
      return "Draft prepared for review before client use.";
    case "draft.edited":
      return "RM revised the draft and resubmitted it.";
    case "draft.approved":
      return "Reviewer approved the client-facing draft.";
    case "draft.rejected":
      return "Reviewer returned the draft with required changes.";
    case "draft.sent":
      return "Approved draft was sent and logged.";
    default:
      return undefined;
  }
}

function formatOutputBody(output: Record<string, unknown>, customerName: string) {
  const artifactText = stringValue(output.artifactText);
  const draft = stringValue(output.draft);
  const plainLanguage = stringValue(output.plainLanguage);
  if (artifactText) return artifactText;
  if (draft) return draft;
  if (plainLanguage) return plainLanguage;

  const bullets = stringArray(output.bullets);
  if (bullets.length > 0) return bullets.map((item) => `- ${item}`).join("\n");

  const actions = Array.isArray(output.actions)
    ? output.actions
        .map((item) => isRecord(item) ? stringValue(item.label) ?? stringValue(item.reason) : undefined)
        .filter((item): item is string => Boolean(item))
    : [];
  if (actions.length > 0) return actions.map((item) => `- ${item}`).join("\n");

  return `Prepared output for ${customerName}.`;
}

function channelLabelFor(channel: string | undefined) {
  if (channel === "email") return "Email";
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "call_script" || channel === "voice_outbound" || channel === "voice_inbound") return "Phone";
  if (channel === "talking_points") return "Talking points";
  if (channel === "term_explainer") return "Knowledge answer";
  if (channel === "analysis") return "Analysis";
  return "Client review";
}

function approvalLabelFor(approval: AgentRun["approvalRequired"] | undefined, kind: EvidencePack["kind"]) {
  if (approval === "manager-approval") return "Manager review required before client use.";
  if (approval === "rm-approval") return "RM review required before client use.";
  if (approval === "auto") return kind === "draft" ? "Review-before-use retained by RM." : "Internal preparation output; no client-send approval required.";
  return kind === "draft" ? "Review-before-use status recorded." : "Trace retained for internal preparation.";
}

function buildApprovalChain(timeline: EvidenceTimelineItem[], rmName: string, reviewerName?: string) {
  const names = timeline
    .filter((item) => item.label === "Created" || item.label === "Edited" || item.label === "Approved" || item.label === "Returned" || item.label === "Sent")
    .map((item) => item.actorName)
    .filter(Boolean);
  const deduped = [...new Set(names)];
  if (deduped.length > 0) return deduped;
  return [...new Set([rmName, reviewerName].filter((item): item is string => Boolean(item)))];
}

function buildRuleChecks(run: AgentRun | undefined, output: Record<string, unknown>, kind: EvidencePack["kind"]) {
  const checks = [
    approvalLabelFor(run?.approvalRequired, kind),
    run?.vocabularyAdjusted
      ? "Vocabulary guard adjusted restricted wording."
      : "Vocabulary guard completed without wording changes."
  ];

  if (run?.roleAtRun === "Junior" && kind === "draft") {
    checks.push("Junior RM client-facing draft routed to Manager review.");
  }

  const checklist = stringArray(output.approvalChecklist);
  for (const item of checklist) checks.push(item);

  return [...new Set(checks)].slice(0, 8);
}

function sanitizeSourceRefs(sourceRefs: string[]) {
  const mapped = sourceRefs.map((source) => {
    const value = source.toLowerCase();
    if (value.includes("customer")) return "Customer profile";
    if (value.includes("holding")) return "Holdings and allocation";
    if (value.includes("lifecycle")) return "Lifecycle signals";
    if (value.includes("policy") || value.includes("rule")) return "Institution policy rules";
    if (value.includes("transaction")) return "Transaction history";
    if (value.includes("research")) return "Research notes";
    if (value.includes("kyc")) return "Client file";
    return source.replace(/[_-]+/g, " ");
  });
  return [...new Set(mapped)].filter((item) => !containsInternalId(item)).slice(0, 8);
}

function buildAppendix(run: AgentRun | undefined) {
  if (!run) return [];
  return [
    run.model ? { label: "Model route", value: run.model } : undefined,
    { label: "Redaction level", value: run.redactionLevel },
    { label: "Latency", value: `${run.latencyMs} ms` },
    run.cached !== undefined ? { label: "Cache", value: run.cached ? "Used cached context" : "Fresh context" } : undefined
  ].filter((item): item is { label: string; value: string } => Boolean(item));
}

function containsInternalId(value: string) {
  return /\b(cust|run|rm|wf|prod)_/i.test(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asRole(value: unknown): RMRole | undefined {
  return value === "Junior" || value === "MidLevel" || value === "Manager" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
