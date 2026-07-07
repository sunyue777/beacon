import { readFile } from "node:fs/promises";
import path from "node:path";
import { daysSince } from "@/lib/domain/client-signals";
import type { Repo } from "./repo";
import { getRuntimeAgentRuns, getRuntimeAudit } from "./runtime-events";
import { getRuntimeTranscripts } from "./runtime-events";
import type {
  Account,
  AgentRun,
  AuditEvent,
  CustomerProfile,
  DataBundle,
  Holding,
  LifecycleEvent,
  ListCustomersOptions,
  MarketSnapshot,
  ModuleConfig,
  PagedResult,
  Product,
  ResearchArticle,
  RMRole,
  RMUser,
  Transcript,
  Transaction
} from "./types";

const dataPath = path.join(process.cwd(), "data", "asia-wealth", "bundle.json");

export class LocalJsonRepo implements Repo {
  private cache?: DataBundle;

  async listRms(): Promise<RMUser[]> {
    return (await this.data()).rms;
  }

  async listCustomers(options: ListCustomersOptions = {}): Promise<PagedResult<CustomerProfile>> {
    const data = await this.data();
    const referenceDate = getLatestMarketDate(data);
    const visibleIds = this.visibleCustomerIds(data.rms, options.role, options.rmId);
    const query = options.query?.trim().toLowerCase();
    let items = data.customers.filter((customer) => !visibleIds || visibleIds.has(customer.customerId));

    if (options.ownedBy) {
      items = items.filter((customer) => customer.rmId === options.ownedBy);
    }

    if (options.priority) {
      items = items.filter((customer) => {
        if (options.priority === "high") return customer.priorityScore >= 76;
        if (options.priority === "reviewDue") return customer.tags.includes("ReviewDue");
        if (options.priority === "rebalance") return customer.tags.includes("RiskMismatch") || data.holdings.some((holding) => holding.customerId === customer.customerId && holding.riskStatus === "mismatch");
        if (options.priority === "dormant") return customer.hasDormantClientSignal;
        if (options.priority === "noRecentContact") {
          const since = daysSince(customer.lastContactedAt, referenceDate);
          return since === undefined || since >= 120;
        }
        if (options.priority === "maturitySoon") return customer.tags.includes("Maturity") || data.lifecycleEvents.some((event) => event.customerId === customer.customerId && event.type === "Maturity");
        const since = daysSince(customer.lastContactedAt, referenceDate);
        return since !== undefined && since <= 21;
      });
    }

    if (options.serviceTier) {
      items = items.filter((customer) => customer.serviceTier === options.serviceTier);
    }

    if (options.lifecycle) {
      const customerIds = new Set(
        data.lifecycleEvents
          .filter((event) => options.lifecycle === "High" ? event.importance === "High" : event.type === options.lifecycle)
          .map((event) => event.customerId)
      );
      items = items.filter((customer) => customerIds.has(customer.customerId));
    }

    if (options.risk) {
      if (options.risk === "mismatch") {
        const customerIds = new Set(
          data.holdings.filter((holding) => holding.riskStatus === "mismatch").map((holding) => holding.customerId)
        );
        items = items.filter((customer) => customerIds.has(customer.customerId));
      } else {
        items = items.filter((customer) => customer.riskProfile === options.risk);
      }
    }

    if (query) {
      items = items.filter((customer) => [customer.name, customer.profession, customer.location.city].join(" ").toLowerCase().includes(query));
    }

    items = items.sort((a, b) => {
      if (options.sort === "aumDesc") return b.totalAum - a.totalAum || b.priorityScore - a.priorityScore;
      if (options.sort === "aumAsc") return a.totalAum - b.totalAum || b.priorityScore - a.priorityScore;
      if (options.sort === "nextReview") return a.nextReviewDate.localeCompare(b.nextReviewDate) || b.priorityScore - a.priorityScore;
      if (options.sort === "name") return a.name.localeCompare(b.name);
      return b.priorityScore - a.priorityScore || b.totalAum - a.totalAum;
    });
    const total = items.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? total;
    return { items: items.slice(offset, offset + limit), total };
  }

  async getCustomer(customerId: string): Promise<CustomerProfile | undefined> {
    return (await this.data()).customers.find((customer) => customer.customerId === customerId);
  }

  async canViewCustomer(
    customerId: string,
    options: { rmId?: string; role?: RMRole }
  ): Promise<boolean> {
    const data = await this.data();
    const visibleIds = this.visibleCustomerIds(data.rms, options.role, options.rmId);
    if (!visibleIds) {
      // undefined === unrestricted scope (manager / team-wide)
      return true;
    }
    return visibleIds.has(customerId);
  }

  async listAccounts(customerId?: string): Promise<Account[]> {
    const items = (await this.data()).accounts;
    return customerId ? items.filter((item) => item.customerId === customerId) : items;
  }

  async listProducts(): Promise<Product[]> {
    return (await this.data()).products;
  }

  async listHoldings(customerId?: string): Promise<Holding[]> {
    const items = (await this.data()).holdings;
    return customerId ? items.filter((item) => item.customerId === customerId) : items;
  }

  async listTransactions(customerId?: string, options: { limit?: number } = {}): Promise<Transaction[]> {
    const items = (await this.data()).transactions
      .filter((item) => !customerId || item.customerId === customerId)
      .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
    return options.limit ? items.slice(0, options.limit) : items;
  }

  async listLifecycleEvents(customerId?: string): Promise<LifecycleEvent[]> {
    const items = (await this.data()).lifecycleEvents
      .filter((item) => !customerId || item.customerId === customerId)
      .sort((a, b) => b.date.localeCompare(a.date));
    return items;
  }

  async getLatestMarketSnapshot(): Promise<MarketSnapshot | undefined> {
    return (await this.data()).marketSnapshots.sort((a, b) => b.date.localeCompare(a.date))[0];
  }

  async listResearchArticles(): Promise<ResearchArticle[]> {
    return (await this.data()).researchArticles;
  }

  async listAgentRuns(options: { customerId?: string; limit?: number } = {}): Promise<AgentRun[]> {
    const bundle = (await this.data()).agentRuns;
    const merged = [...getRuntimeAgentRuns(), ...bundle];
    const items = merged
      .filter((item) => !options.customerId || item.customerId === options.customerId)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
    return options.limit ? items.slice(0, options.limit) : items;
  }

  async listAuditEvents(options: { customerId?: string; limit?: number } = {}): Promise<AuditEvent[]> {
    // Merge bundle events with any runtime-generated audit events (e.g. login
    // sessions). This keeps the audit pulse fresh without touching disk.
    const bundle = (await this.data()).auditEvents;
    const merged = [...getRuntimeAudit(), ...bundle];
    const items = merged
      .filter((item) => !options.customerId || item.customerId === options.customerId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return options.limit ? items.slice(0, options.limit) : items;
  }

  async listModuleConfigs(): Promise<ModuleConfig[]> {
    return (await this.data()).moduleConfigs;
  }

  async listTranscripts(options: { customerId?: string; limit?: number } = {}): Promise<Transcript[]> {
    const bundle = (await this.data()).transcripts ?? [];
    const merged = [...getRuntimeTranscripts(), ...bundle];
    const items = merged
      .filter((item) => !options.customerId || item.customerId === options.customerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return options.limit ? items.slice(0, options.limit) : items;
  }

  private async data(): Promise<DataBundle> {
    if (!this.cache) {
      const raw = await readFile(dataPath, "utf8");
      this.cache = JSON.parse(raw) as DataBundle;
    }
    return this.cache;
  }

  private visibleCustomerIds(rms: RMUser[], role?: RMRole, rmId?: string) {
    const user = rmId ? rms.find((rm) => rm.rmId === rmId) : role ? rms.find((rm) => rm.role === role) : undefined;
    if (!user || "all" in user.bookScope || "allInTeam" in user.bookScope) {
      return undefined;
    }
    return new Set(user.bookScope.customerIds);
  }
}

function getLatestMarketDate(data: DataBundle) {
  return [...data.marketSnapshots].sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
}
