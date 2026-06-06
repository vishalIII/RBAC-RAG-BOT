// ====================================================================
// SUBSCRIPTION PLANS
// ====================================================================
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  monthlyPromptTokens: number;
  monthlyCompletionTokens: number;
  monthlyPriceCents: number; // Price in cents
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ====================================================================
// COMPANY SUBSCRIPTIONS
// ====================================================================
export type SubscriptionStatus = "active" | "paused" | "cancelled";

export interface CompanySubscription {
  id: string;
  companyId: string;
  planId: string;
  billingCycleStartDate: Date;
  billingCycleEndDate: Date;
  promptTokensUsed: number;
  completionTokensUsed: number;
  estimatedCostCents: number;
  status: SubscriptionStatus;
  paymentMethod?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanySubscriptionWithPlan extends CompanySubscription {
  plan: SubscriptionPlan;
}

// ====================================================================
// TOKEN USAGE LOGS (Per Request)
// ====================================================================
export interface TokenUsageLog {
  id: string;
  companyId: string;
  employeeId: string;
  sessionId: string;
  messageId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCostCents: number;
  completionCostCents: number;
  totalCostCents: number;
  promptTokenRatePer1k: number;
  completionTokenRatePer1k: number;
  modelName: string;
  question?: string;
  contextTokens?: number;
  createdAt: Date;
}

// ====================================================================
// GEMINI RESPONSE METADATA
// ====================================================================
export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

export interface TokenUsageRequest {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelName: string;
  questionPreview?: string;
  contextTokens?: number;
}

// ====================================================================
// DAILY AGGREGATES
// ====================================================================
export interface DailyUsageAggregate {
  id: string;
  companyId: string;
  employeeId: string;
  usageDate: Date;
  promptTokensUsed: number;
  completionTokensUsed: number;
  totalTokensUsed: number;
  totalCostCents: number;
  requestCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ====================================================================
// MONTHLY AGGREGATES
// ====================================================================
export interface MonthlyUsageAggregate {
  id: string;
  companyId: string;
  yearMonth: Date;
  promptTokensUsed: number;
  completionTokensUsed: number;
  totalTokensUsed: number;
  totalCostCents: number;
  requestCount: number;
  uniqueEmployees: number;
  createdAt: Date;
  updatedAt: Date;
}

// ====================================================================
// USAGE ALERTS
// ====================================================================
export type AlertType =
  | "usage_80"
  | "usage_100"
  | "overage"
  | "limit_exceeded";
export type AlertPeriod = "daily" | "monthly";

export interface UsageLimitAlert {
  id: string;
  companyId: string;
  alertType: AlertType;
  currentUsage: number;
  limitValue: number;
  percentageUsed: number;
  isNotified: boolean;
  notifiedAt?: Date;
  alertPeriod: AlertPeriod;
  alertDate: Date;
  createdAt: Date;
}

// ====================================================================
// BILLING INVOICES
// ====================================================================
export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled";

export interface BillingInvoice {
  id: string;
  companyId: string;
  subscriptionId: string;
  invoiceNumber: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  promptTokensUsed: number;
  completionTokensUsed: number;
  totalTokensUsed: number;
  basePlanCostCents: number;
  overageCostCents: number;
  discountCents: number;
  totalAmountCents: number;
  paymentStatus: PaymentStatus;
  paidAt?: Date;
  dueDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ====================================================================
// PRICING RATES (Historical)
// ====================================================================
export interface PricingRate {
  id: string;
  modelName: string;
  promptTokenRatePer1k: number; // cents
  completionTokenRatePer1k: number; // cents
  effectiveDate: Date;
  endDate?: Date;
  isActive: boolean;
  createdAt: Date;
}

// ====================================================================
// AUDIT TRAIL
// ====================================================================
export interface TokenAuditTrail {
  id: string;
  companyId: string;
  eventType: string;
  description?: string;
  beforePromptTokens?: number;
  beforeCompletionTokens?: number;
  afterPromptTokens?: number;
  afterCompletionTokens?: number;
  modifiedBy?: string;
  createdAt: Date;
}

// ====================================================================
// DASHBOARD DTO/RESPONSE TYPES
// ====================================================================
export interface CompanyUsageStats {
  companyId: string;
  currentMonth: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costCents: number;
    percentOfLimit: number;
  };
  previousMonth: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costCents: number;
  };
  today: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costCents: number;
    requestCount: number;
  };
}

export interface EmployeeUsageStats {
  employeeId: string;
  employeeName: string;
  currentMonth: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costCents: number;
  };
  today: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costCents: number;
    requestCount: number;
  };
}

export interface UsageBreakdown {
  totalRequests: number;
  avgTokensPerRequest: number;
  avgCostPerRequest: number;
  peakUsageDay?: Date;
  topEmployees: Array<{
    employeeId: string;
    name: string;
    tokens: number;
    costCents: number;
  }>;
}

export interface PlanLimitStatus {
  subscriptionId: string;
  planName: string;
  monthlyPromptLimit: number;
  monthlyCompletionLimit: number;
  promptTokensUsed: number;
  completionTokensUsed: number;
  promptPercentUsed: number;
  completionPercentUsed: number;
  daysRemainingInCycle: number;
  resetDate: Date;
}

// ====================================================================
// SERVICE LAYER DTOs
// ====================================================================
export interface RecordTokenUsageParams {
  companyId: string;
  employeeId: string;
  sessionId?: string;
  messageId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelName: string;
  questionPreview?: string;
  contextTokens?: number;
}

export interface CheckUsageLimitParams {
  companyId: string;
  promptTokens: number;
  completionTokens: number;
}

export interface CheckLimitResponse {
  isWithinLimit: boolean;
  currentUsagePercent: number;
  tokensRemaining: number;
  willExceedLimit: boolean;
  daysUntilReset: number;
}

// ====================================================================
// ERROR TYPES
// ====================================================================
export class LimitExceededError extends Error {
  constructor(
    public companyId: string,
    public currentUsagePercent: number,
    public limitType: "monthly" | "daily"
  ) {
    super(
      `Usage limit exceeded for company ${companyId}: ${currentUsagePercent}%`
    );
    this.name = "LimitExceededError";
  }
}

export class InsufficientTokensError extends Error {
  constructor(
    public companyId: string,
    public requestedTokens: number,
    public availableTokens: number
  ) {
    super(
      `Insufficient tokens. Requested: ${requestedTokens}, Available: ${availableTokens}`
    );
    this.name = "InsufficientTokensError";
  }
}
