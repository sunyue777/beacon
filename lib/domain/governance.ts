import type { AgentRun, AuditEvent, CustomerProfile, RMRole, RMUser } from "@/lib/repo/types";
import { daysSince, daysUntil } from "./client-signals";

/* --------------------------- Approval queue ---------------------------- */

/**
 * Reverse-engineer pending approval items from live draft audit events.
 * v1.0 deliberately ignores seeded draft shells and permission denials:
 * only client-facing `draft_assist` runs write `draft.created` with a
 * runId, so the queue stays tied to a reviewable artifact.
 */
export function getApprovalQueue(events: AuditEvent[]) {
  const tracked = events.filter((event) =>
    Boolean(event.runId) &&
    (
      event.type === "draft.created" ||
      event.type === "draft.edited" ||
      event.type === "draft.approved" ||
      event.type === "draft.rejected" ||
      event.type === "draft.discarded" ||
      event.type === "draft.sent"
    )
  );
  const latestByItem = new Map<string, AuditEvent>();

  for (const event of tracked.sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const key = event.runId ?? event.eventId;
    latestByItem.set(key, event);
  }

  return [...latestByItem.values()]
    .filter((event) => event.type === "draft.created" || event.type === "draft.edited")
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Role-aware approval queue. The number an account sees on their workspace
 * must reflect their lane:
 *   - Junior  → drafts they themselves created that are awaiting review.
 *   - MidLevel→ same; their own drafts that are still pending.
 *   - Manager → drafts created by anyone in the team that are awaiting
 *               their approval. (Excludes Manager's own drafts.)
 */
export function getApprovalQueueForAccount(
  events: AuditEvent[],
  account: { rmId: string; role: RMRole }
) {
  const queue = getApprovalQueue(events);
  if (account.role === "Manager") {
    return queue.filter((event) => event.actorId !== account.rmId && approvalRequiredFromEvent(event) === "manager-approval");
  }
  return queue.filter((event) => event.actorId === account.rmId);
}

function approvalRequiredFromEvent(event: AuditEvent): AgentRun["approvalRequired"] | undefined {
  const value = event.payload?.approvalRequired;
  if (value === "auto" || value === "rm-approval" || value === "manager-approval") {
    return value;
  }
  return undefined;
}

/**
 * Drafts rejected by a reviewer return to the originating RM for edits.
 * The latest event is the source of truth; once the originator marks it
 * edited, the item moves back into the approval queue.
 */
export function getReturnedDraftsForAccount(
  events: AuditEvent[],
  runs: AgentRun[],
  account: { rmId: string; role: RMRole }
) {
  if (account.role === "Manager") return [];

  const runById = new Map(runs.map((run) => [run.runId, run]));
  const tracked = events.filter((event) =>
    Boolean(event.runId) &&
    (
      event.type === "draft.created" ||
      event.type === "draft.edited" ||
      event.type === "draft.approved" ||
      event.type === "draft.rejected" ||
      event.type === "draft.discarded" ||
      event.type === "draft.sent"
    )
  );
  const latestByItem = new Map<string, AuditEvent>();

  for (const event of tracked.sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    latestByItem.set(event.runId ?? event.eventId, event);
  }

  return [...latestByItem.values()]
    .filter((event) => event.type === "draft.rejected" && runById.get(event.runId ?? "")?.rmId === account.rmId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/* --------------------------- Coverage / productivity ---------------------------- */

export function getRmCoverage(rms: RMUser[], customers: CustomerProfile[], runs: AgentRun[], events: AuditEvent[]) {
  return rms.map((rm) => {
    const rmCustomers = customers.filter((customer) => customer.rmId === rm.rmId);
    const rmRuns = runs.filter((run) => run.rmId === rm.rmId);
    const rmApprovals = getApprovalQueue(events).filter((event) => event.actorId === rm.rmId);
    const productivity = getProductivityForBook(rmCustomers);
    return {
      rm,
      customerCount: rmCustomers.length,
      aiRunCount: rmRuns.length,
      pendingApprovalCount: rmApprovals.length,
      touchesPerWeek: productivity.touchesPerWeek,
      contactedIn90dPct: productivity.contactedIn90dPct
    };
  });
}

/**
 * Touches/week and "% of book contacted in 90d" derived from
 * customer.lastContactedAt. Treats each customer with a recent contact
 * as one touch in that window. Production should use audit events
 * (client.opened, draft.sent) instead.
 */
export function getProductivityForBook(customers: CustomerProfile[]) {
  if (customers.length === 0) {
    return { touchesPerWeek: 0, contactedIn90dPct: 0 };
  }
  let touches30d = 0;
  let contacted90d = 0;
  for (const customer of customers) {
    const since = daysSince(customer.lastContactedAt);
    if (since === undefined) continue;
    if (since <= 30) touches30d += 1;
    if (since <= 90) contacted90d += 1;
  }
  return {
    touchesPerWeek: Math.round((touches30d / 4.3) * 10) / 10,
    contactedIn90dPct: Math.round((contacted90d / customers.length) * 100)
  };
}

/**
 * Weekly touch counts for the trailing `weeks` weeks, oldest first, derived
 * from customer.lastContactedAt (same demo simplification as
 * getProductivityForBook: one customer = one touch in its contact week).
 */
export function getWeeklyTouchSeries(customers: CustomerProfile[], weeks = 6): number[] {
  const series = new Array<number>(weeks).fill(0);
  for (const customer of customers) {
    const since = daysSince(customer.lastContactedAt);
    if (since === undefined || since < 0) continue;
    const weeksAgo = Math.floor(since / 7);
    if (weeksAgo < weeks) {
      series[weeks - 1 - weeksAgo] += 1;
    }
  }
  return series;
}

/* --------------------------- Compliance hygiene ---------------------------- */

/**
 * Three governance hygiene metrics a head of wealth typically asks first:
 *   - Drafts rejected rate (rejected / total drafts touched)
 *   - Suitability questionnaire expiring within 30 days
 *   - Customer reviews currently overdue
 * Returns counts, not percentages, so the UI can decide presentation.
 */
export function getComplianceHygiene(customers: CustomerProfile[], events: AuditEvent[]) {
  const draftEvents = events.filter((e) => e.type.startsWith("draft."));
  const rejected = draftEvents.filter((e) => e.type === "draft.rejected").length;
  const draftsTouched = draftEvents.length || 1;
  const draftsRejectedRate = Math.round((rejected / draftsTouched) * 100);

  const suitabilityExpiring = customers.filter((customer) => {
    const until = daysUntil(customer.suitabilityExpiresAt);
    return until !== undefined && until <= 30;
  }).length;

  const reviewOverdue = customers.filter((customer) => {
    const until = daysUntil(customer.nextReviewDate);
    return until !== undefined && until < 0;
  }).length;

  return {
    draftsRejectedRate,
    draftsTouched: draftEvents.length,
    suitabilityExpiring,
    reviewOverdue
  };
}

export function getChannelUsage(runs: AgentRun[]) {
  const usage = new Map<AgentRun["channel"], number>();
  for (const run of runs) {
    usage.set(run.channel, (usage.get(run.channel) ?? 0) + 1);
  }
  return [...usage.entries()]
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);
}
