import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { demoAccounts } from "@/lib/auth/accounts";
import { sessionCookieName } from "@/lib/auth/constants";
import { isCopilotModule, type CopilotModelRoute, type CopilotRunRequest, type CopilotRuntime } from "@/lib/agent-studio/types";
import { buildCopilotContext } from "@/lib/copilot/context";
import { getClient } from "@/lib/copilot/dispatch";
import { getCopilotModuleConfig } from "@/lib/copilot/module-map";
import { getRepo } from "@/lib/repo";
import { incrementRuntimeCounter, pushRuntimeAgentRun, pushRuntimeAudit } from "@/lib/repo/runtime-store";
import type { Account, AgentRun, AuditEvent, CustomerProfile, Holding, LifecycleEvent, MarketSnapshot, Product, Transaction } from "@/lib/repo/types";

export async function POST(request: Request) {
  let payload: CopilotRunRequest;
  try {
    payload = (await request.json()) as CopilotRunRequest;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid json" }, { status: 400 });
  }

  if (!isCopilotModule(payload?.module)) {
    return NextResponse.json({ ok: false, reason: "invalid copilot module" }, { status: 400 });
  }

  if (payload.customerId !== undefined && typeof payload.customerId !== "string") {
    return NextResponse.json({ ok: false, reason: "invalid customer id" }, { status: 400 });
  }

  if (payload.intent !== undefined && typeof payload.intent !== "string") {
    return NextResponse.json({ ok: false, reason: "invalid intent" }, { status: 400 });
  }

  if (payload.runtimeOverride !== undefined && !isRuntimeOverride(payload.runtimeOverride)) {
    return NextResponse.json({ ok: false, reason: "invalid runtime override" }, { status: 400 });
  }
  if (payload.runtimeOverride !== undefined && !getCopilotModuleConfig(payload.module).allowedRuntimeOverrides.includes(payload.runtimeOverride)) {
    return NextResponse.json({ ok: false, reason: "runtime override not allowed for module" }, { status: 400 });
  }

  if (payload.modelRoute !== undefined && !isModelRoute(payload.modelRoute)) {
    return NextResponse.json({ ok: false, reason: "invalid model route" }, { status: 400 });
  }

  if (payload.personalization !== undefined && (!payload.personalization || typeof payload.personalization !== "object" || Array.isArray(payload.personalization))) {
    return NextResponse.json({ ok: false, reason: "invalid personalization" }, { status: 400 });
  }

  if (payload.uiContext !== undefined && (!payload.uiContext || typeof payload.uiContext !== "object" || Array.isArray(payload.uiContext))) {
    return NextResponse.json({ ok: false, reason: "invalid ui context" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionRmId = cookieStore.get(sessionCookieName)?.value;
  const account = demoAccounts.find((item) => item.rmId === sessionRmId);
  if (!account) {
    return NextResponse.json({ ok: false, reason: "missing session" }, { status: 401 });
  }

  const repo = getRepo();
  let customer: CustomerProfile | undefined;
  let accounts: Account[] = [];
  let holdings: Holding[] = [];
  let products: Product[] = [];
  let transactions: Transaction[] = [];
  let lifecycleEvents: LifecycleEvent[] = [];
  let marketSnapshot: MarketSnapshot | undefined;

  if (payload.customerId) {
    const canView = await repo.canViewCustomer(payload.customerId, { rmId: account.rmId, role: account.role });
    if (!canView) {
      await writePermissionAudit(account, payload);
      return NextResponse.json({ ok: false, reason: "customer outside permission scope" }, { status: 403 });
    }

    customer = await repo.getCustomer(payload.customerId);
    if (!customer) {
      return NextResponse.json({ ok: false, reason: "customer not found" }, { status: 404 });
    }

    if (payload.module === "draft_assist" && customer.rmId !== account.rmId) {
      await writePermissionAudit(account, payload);
      return NextResponse.json(
        { ok: false, reason: "client-touch drafts are limited to the owning RM" },
        { status: 403 }
      );
    }

    [accounts, holdings, products, transactions, lifecycleEvents, marketSnapshot] = await Promise.all([
      repo.listAccounts(customer.customerId),
      repo.listHoldings(customer.customerId),
      repo.listProducts(),
      repo.listTransactions(customer.customerId, { limit: 20 }),
      repo.listLifecycleEvents(customer.customerId),
      repo.getLatestMarketSnapshot()
    ]);
  } else {
    [products, marketSnapshot] = await Promise.all([
      repo.listProducts(),
      repo.getLatestMarketSnapshot()
    ]);
  }

  const budgetGuardStep = await getLlmBudgetGuardStep(payload);
  const effectivePayload: CopilotRunRequest = budgetGuardStep ? { ...payload, modelRoute: "mock" } : payload;
  const client = getClient(effectivePayload.module, effectivePayload.runtimeOverride);
  const context = buildCopilotContext({
    request: effectivePayload,
    actor: { rmId: account.rmId, name: account.name, role: account.role },
    customer,
    accounts,
    holdings,
    products,
    transactions,
    lifecycleEvents,
    marketSnapshot
  });
  const result = await client.run(effectivePayload, context);
  if (result.ok) {
    if (budgetGuardStep) {
      result.output = {
        ...result.output,
        fallbackMode: true,
        steps: [...result.output.steps, budgetGuardStep]
      };
    }
    await pushRuntimeAgentRun(result.output);
    await writeOutputAudit(account, result.output.runId, result.output.customerId);
    if (result.output.moduleId === "draft_assist" && result.output.approvalRequired !== "auto") {
      await writeDraftCreatedAudit(account, result.output);
    }
  }

  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}

function isRuntimeOverride(value: unknown): value is CopilotRuntime {
  return value === "skill-direct" || value === "agent-studio" || value === "open-agent" || value === "deterministic";
}

function isModelRoute(value: unknown): value is CopilotModelRoute {
  return value === "mock" || value === "siliconflow";
}

async function getLlmBudgetGuardStep(payload: CopilotRunRequest): Promise<AgentRun["steps"][number] | undefined> {
  if (!requestsLiveLlm(payload)) {
    return undefined;
  }

  const date = new Date().toISOString().slice(0, 10);
  const count = await incrementRuntimeCounter(`beacon:llm:usage:${date}`);
  const cap = getDailyLlmCap();
  if (count <= cap) {
    return undefined;
  }

  return {
    name: "LLM budget guard",
    source: "BeaconRuntimeStore",
    output: {
      note: "Daily live-LLM budget reached; demo continues on local runtime.",
      date,
      count,
      cap,
      fallbackRoute: "mock"
    }
  };
}

function requestsLiveLlm(payload: CopilotRunRequest) {
  return payload.modelRoute === "siliconflow" || (payload.modelRoute === undefined && process.env.BEACON_LLM === "siliconflow");
}

function getDailyLlmCap() {
  const value = Number(process.env.BEACON_DAILY_LLM_CAP ?? "200");
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 200;
}

async function writePermissionAudit(account: { rmId: string; role: AuditEvent["actorRole"] }, payload: CopilotRunRequest) {
  const event: AuditEvent = {
    eventId: `copilot_denied_${account.rmId}_${Date.now()}`,
    type: "role.permission.required",
    actorId: account.rmId,
    actorRole: account.role,
    customerId: payload.customerId,
    timestamp: new Date().toISOString(),
    payload: {
      module: payload.module,
      source: "api/copilot/run"
    }
  };
  await pushRuntimeAudit(event);
}

async function writeOutputAudit(account: { rmId: string; role: AuditEvent["actorRole"] }, runId: string, customerId?: string) {
  const event: AuditEvent = {
    eventId: `copilot_output_${account.rmId}_${Date.now()}`,
    type: "ai.output.shown",
    actorId: account.rmId,
    actorRole: account.role,
    customerId,
    runId,
    timestamp: new Date().toISOString(),
    payload: {
      source: "api/copilot/run"
    }
  };
  await pushRuntimeAudit(event);
}

async function writeDraftCreatedAudit(account: { rmId: string; role: AuditEvent["actorRole"] }, run: { runId: string; customerId?: string; channel: string; approvalRequired?: string }) {
  const event: AuditEvent = {
    eventId: `draft_created_${account.rmId}_${Date.now()}`,
    type: "draft.created",
    actorId: account.rmId,
    actorRole: account.role,
    customerId: run.customerId,
    runId: run.runId,
    timestamp: new Date().toISOString(),
    payload: {
      source: "api/copilot/run",
      channel: run.channel,
      approvalRequired: run.approvalRequired
    }
  };
  await pushRuntimeAudit(event);
}
