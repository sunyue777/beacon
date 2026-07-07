export type RMRole = "Junior" | "MidLevel" | "Manager";
export type CustomerSegment = "Mass" | "Affluent" | "HNW" | "UHNW";
export type RiskProfile = "Conservative" | "ModConservative" | "Moderate" | "ModAggressive" | "Aggressive";
export type PriorityTag = "DormantCash" | "Maturity" | "RiskMismatch" | "MarketMove" | "Lifecycle" | "HighValue" | "ReviewDue" | "ServiceWindow";

export interface RMUser {
  rmId: string;
  name: string;
  email: string;
  role: RMRole;
  bookScope: { customerIds: string[] } | { allInTeam: true } | { all: true };
}

export interface CustomerProfile {
  customerId: string;
  rmId: string;
  name: string;
  avatarInitials: string;
  householdId?: string;
  householdRole?: "Primary" | "Spouse" | "Child" | "FamilyOffice" | "None";
  age: number;
  gender: "F" | "M" | "X";
  birthDate: string;
  profession: string;
  incomeBand: string;
  location: { city: string; country: string };
  segment: CustomerSegment;
  riskProfile: RiskProfile;
  totalAum: number;
  currency: string;
  tags: PriorityTag[];
  priorityScore: number;
  lastContactedAt?: string;
  nextReviewDate: string;
  hasDormantClientSignal: boolean;
  serviceTier: "Standard" | "Premium" | "VIP" | "Private";
  assignedRmTier: RMRole;
  advisoryPermissionLevel: "SelfService" | "AdvisorMediated" | "Restricted";
  /** Risk profile review is renewed annually; expiry is surfaced as a service signal. */
  riskProfileReviewedAt: string;
  riskProfileExpiresAt: string;
  /** Suitability questionnaire — last completion + expiry. Asia regs typically
   *  require renewal every 12 months; expired status blocks new advisory. */
  suitabilityCompletedAt: string;
  suitabilityExpiresAt: string;
  /** Knowledge & experience check status (used for complex/structured products). */
  knowledgeAssessmentStatus: "Valid" | "Expiring" | "Expired" | "Pending";
  /** Customer's primary funding currency. Currency exposure is checked
   *  against this when computing risk compliance. */
  fundingCurrency: "USD" | "SGD" | "HKD" | "JPY";
  /** AUM trend (YoY change %), synthesized for demo. */
  aumYoyChangePct: number;
  /** Net cash flow over last 30 days (positive = inflow). */
  netFlow30d: number;
}

export interface Account {
  accountId: string;
  customerId: string;
  type: "Cash" | "Investment" | "TermDeposit" | "Retirement" | "Structured" | "Insurance";
  currency: string;
  cashBalance: number;
  marketValue: number;
  status: "Active" | "Dormant" | "Closed";
  openedAt: string;
}

export interface Product {
  productId: string;
  name: string;
  family: string;
  category: "Fund" | "ETF" | "Bond" | "Structured" | "Deposit" | "Insurance" | "FX" | "EquityBasket" | "ModelPortfolio" | "Alternative";
  geography: "Local" | "Regional" | "Global";
  riskLevel: RiskProfile;
  baseCurrency: string;
  fees: { managementBps: number; entryBps?: number; exitBps?: number };
  inceptionDate: string;
  description: string;
  factsheetUrl?: string;
}

export interface Holding {
  holdingId: string;
  customerId: string;
  accountId: string;
  productId: string;
  value: number;
  currency: string;
  units: number;
  avgCostPrice: number;
  pctOfAum: number;
  riskStatus: "aligned" | "mismatch";
  openedAt: string;
  updatedAt: string;
}

export interface Transaction {
  transactionId: string;
  customerId: string;
  accountId: string;
  productId?: string;
  action: "BUY" | "SELL" | "SUBSCRIBE" | "REDEEM" | "DIVIDEND" | "FEE" | "DEPOSIT" | "WITHDRAW";
  quantity: number;
  price: number;
  totalAmount: number;
  currency: string;
  tradeDate: string;
  valueDate: string;
}

export interface MarketSnapshot {
  snapshotId: string;
  date: string;
  headline: string;
  sentiment: "Positive" | "Neutral" | "Cautious";
  indices: { name: string; value: number; changePct: number }[];
}

export interface ResearchArticle {
  articleId: string;
  title: string;
  date: string;
  summary: string;
  tags: string[];
}

export interface LifecycleEvent {
  eventId: string;
  customerId: string;
  date: string;
  type: "Review" | "Maturity" | "LifeEvent" | "Market" | "Portfolio";
  title: string;
  description: string;
  importance: "Low" | "Medium" | "High";
}

export interface InstitutionPolicyRule {
  ruleId: string;
  personaId: string;
  type: "ProductEligibility" | "Suitability" | "DraftApproval" | "Disclaimer" | "RmPermission";
  description: string;
  severity: "Info" | "Warning" | "Block";
  source: "DemoRule" | "InstitutionPlaceholder";
  enabled: boolean;
}

export interface RuleCheckResult {
  resultId: string;
  ruleId: string;
  customerId?: string;
  productId?: string;
  rmId?: string;
  passed: boolean;
  requiredAction?: "None" | "Review" | "Approval" | "Block";
  explanation: string;
}

export interface AgentRun {
  runId: string;
  channel: "chat" | "email" | "whatsapp" | "talking_points" | "nba" | "analysis" | "term_explainer" | "voice_inbound" | "voice_outbound" | "post_call_summary";
  moduleId?: string;
  requestedRuntime?: "deterministic" | "skill-direct" | "agent-studio" | "open-agent";
  backend?: "deterministic" | "skill-direct" | "agent-studio" | "open-agent";
  model?: string;
  llmProvider?: string;
  skillVersion?: string;
  state?: "prepared" | "edited" | "approved" | "rejected" | "discarded" | "sent";
  approvalRequired?: "auto" | "rm-approval" | "manager-approval";
  why?: string;
  vocabularyAdjusted?: boolean;
  cached?: boolean;
  agentId?: string;
  workflowId?: string;
  personaId: string;
  customerId?: string;
  rmId: string;
  roleAtRun: RMRole;
  inputDigest: string;
  sourceRefs: string[];
  steps: { name: string; inputRef?: string; output: unknown; source: string }[];
  output: unknown;
  fallbackMode: boolean;
  redactionLevel: "Summary" | "Masked" | "FullDemo";
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
}

export interface AuditEvent {
  eventId: string;
  type:
    | "ai.output.shown"
    | "draft.created"
    | "draft.edited"
    | "draft.approved"
    | "draft.rejected"
    | "draft.discarded"
    | "draft.sent"
    | "rec.viewed"
    | "rec.dismissed"
    | "rec.actedOn"
    | "chat.message.sent"
    | "client.opened"
    | "role.permission.required"
    | "role.escalation"
    | "session.started"
    | "session.switched"
    | "voice.call.started"
    | "voice.call.completed"
    | "voice.handoff.required";
  actorId: string;
  actorRole: RMRole;
  customerId?: string;
  runId?: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface ModuleConfig {
  personaId: string;
  moduleId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface Transcript {
  transcriptId: string;
  customerId: string;
  rmId: string;
  channel: "voice_inbound" | "voice_outbound";
  scenario?: "meeting_confirmation" | "maturity_reminder" | "authorization_prompt" | "inbound_rm_assist" | "post_call_follow_up";
  integrationMode?: "web_call_simulator" | "dyna_voice_saas";
  externalCallId?: string;
  handoffRequired?: boolean;
  startedAt: string;
  endedAt: string;
  summary: string;
  turns: { speaker: "customer" | "rm" | "system"; text: string; timestamp: string }[];
}

export interface DataBundle {
  rms: RMUser[];
  customers: CustomerProfile[];
  accounts: Account[];
  products: Product[];
  holdings: Holding[];
  transactions: Transaction[];
  marketSnapshots: MarketSnapshot[];
  researchArticles: ResearchArticle[];
  lifecycleEvents: LifecycleEvent[];
  policyRules: InstitutionPolicyRule[];
  ruleCheckResults: RuleCheckResult[];
  agentRuns: AgentRun[];
  auditEvents: AuditEvent[];
  moduleConfigs: ModuleConfig[];
  transcripts: Transcript[];
}

export interface ListCustomersOptions {
  /** Visibility scope by role (resolves through that role's bookScope). */
  role?: RMRole;
  /** Visibility scope by RM (resolves through that RM's bookScope). */
  rmId?: string;
  /**
   * Strict ownership filter on customer.rmId. Independent of bookScope.
   * Use this for "what's directly on YOUR plate today" (workspace queue).
   * `rmId` / `role` answer "what can this account SEE" (governance lens).
   */
  ownedBy?: string;
  query?: string;
  priority?: "high" | "reviewDue" | "rebalance" | "dormant" | "noRecentContact" | "maturitySoon" | "recentlyContacted";
  serviceTier?: CustomerProfile["serviceTier"];
  lifecycle?: LifecycleEvent["type"] | "High";
  risk?: RiskProfile | "mismatch";
  sort?: "priority" | "aumDesc" | "aumAsc" | "name" | "nextReview";
  limit?: number;
  offset?: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
}
