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
  RMRole,
  RMUser,
  Transcript,
  Transaction
} from "./types";

export interface Repo {
  listRms(): Promise<RMUser[]>;
  listCustomers(options?: ListCustomersOptions): Promise<PagedResult<CustomerProfile>>;
  getCustomer(customerId: string): Promise<CustomerProfile | undefined>;
  /**
   * Centralized visibility check. Returns true when the given account
   * (rmId or role) is allowed to see this customer. Used by the customer
   * detail page so authorization lives in the repo layer, not the UI.
   */
  canViewCustomer(customerId: string, options: { rmId?: string; role?: RMRole }): Promise<boolean>;
  listAccounts(customerId?: string): Promise<Account[]>;
  listProducts(): Promise<Product[]>;
  listHoldings(customerId?: string): Promise<Holding[]>;
  listTransactions(customerId?: string, options?: { limit?: number }): Promise<Transaction[]>;
  listLifecycleEvents(customerId?: string): Promise<LifecycleEvent[]>;
  getLatestMarketSnapshot(): Promise<MarketSnapshot | undefined>;
  listResearchArticles(): Promise<ResearchArticle[]>;
  listAgentRuns(options?: { customerId?: string; limit?: number }): Promise<AgentRun[]>;
  listAuditEvents(options?: { customerId?: string; limit?: number }): Promise<AuditEvent[]>;
  listModuleConfigs(): Promise<ModuleConfig[]>;
  listTranscripts(options?: { customerId?: string; limit?: number }): Promise<Transcript[]>;
}
