import type { CopilotContext, CopilotPosture, CopilotRunRequest } from "@/lib/agent-studio/types";
import type {
  Account,
  CustomerProfile,
  Holding,
  LifecycleEvent,
  MarketSnapshot,
  Product,
  RMUser,
  Transaction
} from "@/lib/repo/types";

export function buildCopilotContext({
  request,
  actor,
  customer,
  accounts = [],
  holdings = [],
  products = [],
  transactions = [],
  lifecycleEvents = [],
  marketSnapshot,
  requestedAt = new Date().toISOString()
}: {
  request: CopilotRunRequest;
  actor: Pick<RMUser, "rmId" | "name" | "role">;
  customer?: CustomerProfile;
  accounts?: Account[];
  holdings?: Holding[];
  products?: Product[];
  transactions?: Transaction[];
  lifecycleEvents?: LifecycleEvent[];
  marketSnapshot?: MarketSnapshot;
  requestedAt?: string;
}): CopilotContext {
  return {
    module: request.module,
    actor,
    roleAtRun: actor.role,
    posture: resolveCopilotPosture(),
    intent: request.intent,
    runtimeOverride: request.runtimeOverride,
    modelRoute: request.modelRoute,
    personalization: normalizePersonalization(request.personalization),
    uiContext: request.uiContext,
    customer,
    accounts,
    holdings,
    products,
    transactions,
    lifecycleEvents,
    marketSnapshot,
    sourceRefs: buildSourceRefs({ customer, accounts, holdings, transactions, lifecycleEvents, marketSnapshot }),
    requestedAt
  };
}

function resolveCopilotPosture(): CopilotPosture {
  const value = process.env.COPILOT_POSTURE;
  if (value === "balanced" || value === "forward") return value;
  return "conservative";
}

function normalizePersonalization(personalization: CopilotRunRequest["personalization"]) {
  return {
    customerHabits: Array.isArray(personalization?.customerHabits)
      ? personalization.customerHabits.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 8)
      : [],
    rmCustomInput: typeof personalization?.rmCustomInput === "string" ? personalization.rmCustomInput.trim().slice(0, 1200) : ""
  };
}

function buildSourceRefs({
  customer,
  accounts,
  holdings,
  transactions,
  lifecycleEvents,
  marketSnapshot
}: {
  customer?: CustomerProfile;
  accounts: Account[];
  holdings: Holding[];
  transactions: Transaction[];
  lifecycleEvents: LifecycleEvent[];
  marketSnapshot?: MarketSnapshot;
}) {
  const refs: string[] = [];
  if (customer) refs.push(`customer:${customer.customerId}`);
  refs.push(...accounts.slice(0, 6).map((item) => `account:${item.accountId}`));
  refs.push(...holdings.slice(0, 12).map((item) => `holding:${item.holdingId}`));
  refs.push(...transactions.slice(0, 8).map((item) => `transaction:${item.transactionId}`));
  refs.push(...lifecycleEvents.slice(0, 8).map((item) => `event:${item.eventId}`));
  if (marketSnapshot) refs.push(`market:${marketSnapshot.snapshotId}`);
  return refs;
}
