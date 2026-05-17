import type { Repo } from "./repo";
import type {
  Account,
  AgentRun,
  AuditEvent,
  CustomerProfile,
  Holding,
  LifecycleEvent,
  ListCustomersOptions,
  MarketSnapshot,
  ModuleConfig,
  PagedResult,
  Product,
  ResearchArticle,
  RMUser,
  Transcript,
  Transaction
} from "./types";

export class RemoteApiRepo implements Repo {
  constructor(private readonly baseUrl: string) {}

  listRms(): Promise<RMUser[]> {
    return this.fetchJson("/rms");
  }

  listCustomers(options: ListCustomersOptions = {}): Promise<PagedResult<CustomerProfile>> {
    return this.fetchJson(`/customers${this.queryString(options)}`);
  }

  getCustomer(customerId: string): Promise<CustomerProfile | undefined> {
    return this.fetchJson(`/customers/${customerId}`);
  }

  canViewCustomer(
    customerId: string,
    options: { rmId?: string; role?: import("./types").RMRole }
  ): Promise<boolean> {
    return this.fetchJson(`/customers/${customerId}/can-view${this.queryString(options)}`);
  }

  listAccounts(customerId?: string): Promise<Account[]> {
    return this.fetchJson(customerId ? `/customers/${customerId}/accounts` : "/accounts");
  }

  listProducts(): Promise<Product[]> {
    return this.fetchJson("/products");
  }

  listHoldings(customerId?: string): Promise<Holding[]> {
    return this.fetchJson(customerId ? `/customers/${customerId}/holdings` : "/holdings");
  }

  listTransactions(customerId?: string, options: { limit?: number } = {}): Promise<Transaction[]> {
    const query = this.queryString(options);
    return this.fetchJson(customerId ? `/customers/${customerId}/transactions${query}` : `/transactions${query}`);
  }

  listLifecycleEvents(customerId?: string): Promise<LifecycleEvent[]> {
    return this.fetchJson(customerId ? `/customers/${customerId}/events` : "/events");
  }

  getLatestMarketSnapshot(): Promise<MarketSnapshot | undefined> {
    return this.fetchJson("/market/latest");
  }

  listResearchArticles(): Promise<ResearchArticle[]> {
    return this.fetchJson("/research");
  }

  listAgentRuns(options: { customerId?: string; limit?: number } = {}): Promise<AgentRun[]> {
    return this.fetchJson(`/agent-runs${this.queryString(options)}`);
  }

  listAuditEvents(options: { customerId?: string; limit?: number } = {}): Promise<AuditEvent[]> {
    return this.fetchJson(`/audit-events${this.queryString(options)}`);
  }

  listModuleConfigs(): Promise<ModuleConfig[]> {
    return this.fetchJson("/module-configs");
  }

  listTranscripts(options: { customerId?: string; limit?: number } = {}): Promise<Transcript[]> {
    return this.fetchJson(`/transcripts${this.queryString(options)}`);
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`RemoteApiRepo request failed: ${response.status} ${path}`);
    }
    return response.json() as Promise<T>;
  }

  private queryString(options: object) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options as Record<string, unknown>)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  }
}
