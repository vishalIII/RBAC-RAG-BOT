import  pool  from "../../config/db.js";
import {
  TokenUsageLog,
  RecordTokenUsageParams,
  CheckUsageLimitParams,
  CheckLimitResponse,
  DailyUsageAggregate,
  MonthlyUsageAggregate,
  SubscriptionStatus,
  LimitExceededError,
  InsufficientTokensError,
  PricingRate,
} from "../../types/billing.types.js";

// ====================================================================
// PRICING CONSTANTS
// ====================================================================
const GEMINI_PRICING = {
  // Cost per 1000 tokens in cents
  PROMPT_TOKENS_PER_1K: 1, // $0.0000075 per token ≈ 1 cent per 1000
  COMPLETION_TOKENS_PER_1K: 4, // $0.00003 per token ≈ 4 cents per 1000
};

// ====================================================================
// GET ACTIVE PRICING RATE
// ====================================================================
export async function getActivePricingRate(
  modelName: string = "gemini-2.5-flash"
): Promise<PricingRate> {
  const result = await pool.query(
    `
    SELECT id, model_name, prompt_token_rate_per_1k, completion_token_rate_per_1k,
           effective_date, end_date, is_active, created_at
    FROM pricing_rates
    WHERE model_name = $1
    AND is_active = true
    AND effective_date <= NOW()
    AND (end_date IS NULL OR end_date > NOW())
    ORDER BY effective_date DESC
    LIMIT 1
    `,
    [modelName]
  );

  if (result.rows.length === 0) {
    // Fallback to hardcoded rates if no rate found in DB
    return {
      id: "default",
      modelName,
      promptTokenRatePer1k: GEMINI_PRICING.PROMPT_TOKENS_PER_1K,
      completionTokenRatePer1k: GEMINI_PRICING.COMPLETION_TOKENS_PER_1K,
      effectiveDate: new Date(),
      isActive: true,
      createdAt: new Date(),
    };
  }

  return result.rows[0];
}

// ====================================================================
// CALCULATE COST FOR TOKENS
// ====================================================================
export function calculateTokenCost(
  promptTokens: number,
  completionTokens: number,
  promptRatePer1k: number,
  completionRatePer1k: number
): { promptCostCents: number; completionCostCents: number; totalCents: number } {
  const promptCostCents = Math.ceil((promptTokens / 1000) * promptRatePer1k);
  const completionCostCents = Math.ceil(
    (completionTokens / 1000) * completionRatePer1k
  );
  const totalCents = promptCostCents + completionCostCents;

  return { promptCostCents, completionCostCents, totalCents };
}

// ====================================================================
// RECORD TOKEN USAGE
// ====================================================================
export async function recordTokenUsage(
  params: RecordTokenUsageParams
): Promise<TokenUsageLog> {
  const {
    companyId,
    employeeId,
    sessionId,
    messageId,
    promptTokens,
    completionTokens,
    totalTokens,
    modelName,
    questionPreview,
    contextTokens,
  } = params;

  // Get current pricing rate
  const pricingRate = await getActivePricingRate(modelName);

  // Calculate costs
  const { promptCostCents, completionCostCents, totalCents } =
    calculateTokenCost(
      promptTokens,
      completionTokens,
      pricingRate.promptTokenRatePer1k,
      pricingRate.completionTokenRatePer1k
    );

  // Record usage
  const result = await pool.query(
    `
    INSERT INTO token_usage_logs (
      company_id, employee_id, session_id, message_id,
      prompt_tokens, completion_tokens, total_tokens,
      prompt_cost_cents, completion_cost_cents, total_cost_cents,
      prompt_token_rate_per_1k, completion_token_rate_per_1k,
      model_name, question, context_tokens, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
    )
    RETURNING id, company_id, employee_id, session_id, message_id,
              prompt_tokens, completion_tokens, total_tokens,
              prompt_cost_cents, completion_cost_cents, total_cost_cents,
              prompt_token_rate_per_1k, completion_token_rate_per_1k,
              model_name, question, context_tokens, created_at
    `,
    [
      companyId,
      employeeId,
      sessionId,
      messageId || null,
      promptTokens,
      completionTokens,
      totalTokens,
      promptCostCents,
      completionCostCents,
      totalCents,
      pricingRate.promptTokenRatePer1k,
      pricingRate.completionTokenRatePer1k,
      modelName,
      questionPreview || null,
      contextTokens || null,
    ]
  );

  const usageLog = result.rows[0];

  // Update company subscription totals
  await pool.query(
    `
    UPDATE company_subscriptions
    SET prompt_tokens_used = prompt_tokens_used + $1,
        completion_tokens_used = completion_tokens_used + $2,
        estimated_cost_cents = estimated_cost_cents + $3,
        updated_at = NOW()
    WHERE company_id = $4
    `,
    [promptTokens, completionTokens, totalCents, companyId]
  );

  // Update daily aggregate
  const today = new Date().toISOString().split("T")[0];
  await pool.query(
    `
    INSERT INTO daily_usage_aggregates (
      company_id, employee_id, usage_date,
      prompt_tokens_used, completion_tokens_used, total_tokens_used,
      total_cost_cents, request_count, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 1, NOW(), NOW()
    )
    ON CONFLICT (company_id, employee_id, usage_date)
    DO UPDATE SET
      prompt_tokens_used = daily_usage_aggregates.prompt_tokens_used + $4,
      completion_tokens_used = daily_usage_aggregates.completion_tokens_used + $5,
      total_tokens_used = daily_usage_aggregates.total_tokens_used + $6,
      total_cost_cents = daily_usage_aggregates.total_cost_cents + $7,
      request_count = daily_usage_aggregates.request_count + 1,
      updated_at = NOW()
    `,
    [
      companyId,
      employeeId,
      today,
      promptTokens,
      completionTokens,
      totalTokens,
      totalCents,
    ]
  );

  return {
    id: usageLog.id,
    companyId: usageLog.company_id,
    employeeId: usageLog.employee_id,
    sessionId: usageLog.session_id,
    messageId: usageLog.message_id,
    promptTokens: usageLog.prompt_tokens,
    completionTokens: usageLog.completion_tokens,
    totalTokens: usageLog.total_tokens,
    promptCostCents: usageLog.prompt_cost_cents,
    completionCostCents: usageLog.completion_cost_cents,
    totalCostCents: usageLog.total_cost_cents,
    promptTokenRatePer1k: usageLog.prompt_token_rate_per_1k,
    completionTokenRatePer1k: usageLog.completion_token_rate_per_1k,
    modelName: usageLog.model_name,
    question: usageLog.question,
    contextTokens: usageLog.context_tokens,
    createdAt: usageLog.created_at,
  };
}

// ====================================================================
// CHECK USAGE LIMITS
// ====================================================================
export async function checkUsageLimits(
  params: CheckUsageLimitParams
): Promise<CheckLimitResponse> {
  const { companyId, promptTokens, completionTokens } = params;

  // Get company subscription
  const subscriptionResult = await pool.query(
    `
    SELECT cs.id, cs.prompt_tokens_used, cs.completion_tokens_used,
           cs.billing_cycle_start_date, cs.billing_cycle_end_date,
           sp.monthly_prompt_tokens, sp.monthly_completion_tokens
    FROM company_subscriptions cs
    JOIN subscription_plans sp ON cs.plan_id = sp.id
    WHERE cs.company_id = $1 AND cs.status = 'active'
    `,
    [companyId]
  );

  if (subscriptionResult.rows.length === 0) {
    throw new Error(`No active subscription found for company: ${companyId}`);
  }

  const subscription = subscriptionResult.rows[0];
  const monthlyPromptLimit = subscription.monthly_prompt_tokens;
  const monthlyCompletionLimit = subscription.monthly_completion_tokens;
  const currentPromptUsed = subscription.prompt_tokens_used;
  const currentCompletionUsed = subscription.completion_tokens_used;

  // Calculate projected usage
  const projectedPromptUsage = currentPromptUsed + promptTokens;
  const projectedCompletionUsage = currentCompletionUsed + completionTokens;

  // Check limits
  const promptExceeded = projectedPromptUsage > monthlyPromptLimit;
  const completionExceeded = projectedCompletionUsage > monthlyCompletionLimit;
  const isWithinLimit = !promptExceeded && !completionExceeded;

  // Calculate percentages and remaining tokens
  const promptPercentUsed = Math.round(
    (projectedPromptUsage / monthlyPromptLimit) * 100
  );
  const completionPercentUsed = Math.round(
    (projectedCompletionUsage / monthlyCompletionLimit) * 100
  );
  const currentUsagePercent = Math.max(promptPercentUsed, completionPercentUsed);

  const promptTokensRemaining = Math.max(
    0,
    monthlyPromptLimit - projectedPromptUsage
  );
  const completionTokensRemaining = Math.max(
    0,
    monthlyCompletionLimit - projectedCompletionUsage
  );
  const tokensRemaining = Math.min(
    promptTokensRemaining,
    completionTokensRemaining
  );

  // Calculate days until reset
  const now = new Date();
  const resetDate = new Date(subscription.billing_cycle_end_date);
  const daysUntilReset = Math.ceil(
    (resetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    isWithinLimit,
    currentUsagePercent,
    tokensRemaining,
    willExceedLimit: !isWithinLimit,
    daysUntilReset: Math.max(0, daysUntilReset),
  };
}

// ====================================================================
// ENFORCE USAGE LIMITS
// ====================================================================
export async function enforceUsageLimits(
  params: CheckUsageLimitParams
): Promise<void> {
  const limitStatus = await checkUsageLimits(params);

  if (!limitStatus.isWithinLimit) {
    throw new LimitExceededError(
      params.companyId,
      limitStatus.currentUsagePercent,
      "monthly"
    );
  }
}

// ====================================================================
// GET CURRENT MONTH USAGE
// ====================================================================
export async function getCurrentMonthUsage(
  companyId: string
): Promise<MonthlyUsageAggregate> {
  // First day of current month
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearMonthStr = firstDay.toISOString().split("T")[0];

  const result = await pool.query(
    `
    SELECT id, company_id, year_month,
           prompt_tokens_used, completion_tokens_used, total_tokens_used,
           total_cost_cents, request_count, unique_employees,
           created_at, updated_at
    FROM monthly_usage_aggregates
    WHERE company_id = $1 AND year_month = $2
    `,
    [companyId, yearMonthStr]
  );

  if (result.rows.length > 0) {
    const row = result.rows[0];
    return {
      id: row.id,
      companyId: row.company_id,
      yearMonth: new Date(row.year_month),
      promptTokensUsed: row.prompt_tokens_used,
      completionTokensUsed: row.completion_tokens_used,
      totalTokensUsed: row.total_tokens_used,
      totalCostCents: row.total_cost_cents,
      requestCount: row.request_count,
      uniqueEmployees: row.unique_employees,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Return zeroed out aggregate if it doesn't exist
  return {
    id: "",
    companyId,
    yearMonth: firstDay,
    promptTokensUsed: 0,
    completionTokensUsed: 0,
    totalTokensUsed: 0,
    totalCostCents: 0,
    requestCount: 0,
    uniqueEmployees: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ====================================================================
// GET TODAY'S USAGE
// ====================================================================
export async function getTodayUsage(
  companyId: string,
  employeeId?: string
): Promise<DailyUsageAggregate[]> {
  const today = new Date().toISOString().split("T")[0];

  let query = `
    SELECT id, company_id, employee_id, usage_date,
           prompt_tokens_used, completion_tokens_used, total_tokens_used,
           total_cost_cents, request_count, created_at, updated_at
    FROM daily_usage_aggregates
    WHERE company_id = $1 AND usage_date = $2
  `;

  const params: any[] = [companyId, today];

  if (employeeId) {
    query += ` AND employee_id = $3`;
    params.push(employeeId);
  }

  const result = await pool.query(query, params);

  return result.rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    usageDate: new Date(row.usage_date),
    promptTokensUsed: row.prompt_tokens_used,
    completionTokensUsed: row.completion_tokens_used,
    totalTokensUsed: row.total_tokens_used,
    totalCostCents: row.total_cost_cents,
    requestCount: row.request_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ====================================================================
// GET EMPLOYEE USAGE (MONTH/DAY)
// ====================================================================
export async function getEmployeeMonthlyUsage(
  employeeId: string
): Promise<DailyUsageAggregate[]> {
  const now = new Date();
  const firstDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString().split("T")[0];

  const result = await pool.query(
    `
    SELECT id, company_id, employee_id, usage_date,
           prompt_tokens_used, completion_tokens_used, total_tokens_used,
           total_cost_cents, request_count, created_at, updated_at
    FROM daily_usage_aggregates
    WHERE employee_id = $1 AND usage_date >= $2
    ORDER BY usage_date DESC
    `,
    [employeeId, firstDay]
  );

  return result.rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    usageDate: new Date(row.usage_date),
    promptTokensUsed: row.prompt_tokens_used,
    completionTokensUsed: row.completion_tokens_used,
    totalTokensUsed: row.total_tokens_used,
    totalCostCents: row.total_cost_cents,
    requestCount: row.request_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// ====================================================================
// CREATE USAGE ALERT
// ====================================================================
export async function createUsageAlert(
  companyId: string,
  alertType: "usage_80" | "usage_100" | "overage" | "limit_exceeded",
  currentUsage: number,
  limitValue: number,
  period: "daily" | "monthly"
): Promise<void> {
  const percentageUsed = (currentUsage / limitValue) * 100;
  const alertDate = new Date().toISOString().split("T")[0];

  // Check if alert already exists for today
  const existingAlert = await pool.query(
    `
    SELECT id FROM usage_limit_alerts
    WHERE company_id = $1 AND alert_type = $2
    AND alert_date = $3 AND alert_period = $4
    `,
    [companyId, alertType, alertDate, period]
  );

  if (existingAlert.rows.length > 0) {
    return; // Alert already exists
  }

  await pool.query(
    `
    INSERT INTO usage_limit_alerts (
      company_id, alert_type, current_usage, limit_value,
      percentage_used, is_notified, alert_period, alert_date, created_at
    ) VALUES ($1, $2, $3, $4, $5, false, $6, $7, NOW())
    `,
    [companyId, alertType, currentUsage, limitValue, percentageUsed, period, alertDate]
  );
}

// ====================================================================
// GET UNNOTIFIED ALERTS
// ====================================================================
export async function getUnnotifiedAlerts() {
  const result = await pool.query(
    `
    SELECT id, company_id, alert_type, current_usage, limit_value,
           percentage_used, alert_period, alert_date, created_at
    FROM usage_limit_alerts
    WHERE is_notified = false
    AND created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    `
  );

  return result.rows;
}

// ====================================================================
// MARK ALERT AS NOTIFIED
// ====================================================================
export async function markAlertAsNotified(alertId: string): Promise<void> {
  await pool.query(
    `
    UPDATE usage_limit_alerts
    SET is_notified = true, notified_at = NOW()
    WHERE id = $1
    `,
    [alertId]
  );
}

// ====================================================================
// GET USAGE LOGS (for audit)
// ====================================================================
export async function getUsageLogs(
  companyId: string,
  limit: number = 100,
  offset: number = 0
): Promise<TokenUsageLog[]> {
  const result = await pool.query(
    `
    SELECT id, company_id, employee_id, session_id, message_id,
           prompt_tokens, completion_tokens, total_tokens,
           prompt_cost_cents, completion_cost_cents, total_cost_cents,
           prompt_token_rate_per_1k, completion_token_rate_per_1k,
           model_name, question, context_tokens, created_at
    FROM token_usage_logs
    WHERE company_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [companyId, limit, offset]
  );

  return result.rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    sessionId: row.session_id,
    messageId: row.message_id,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    promptCostCents: row.prompt_cost_cents,
    completionCostCents: row.completion_cost_cents,
    totalCostCents: row.total_cost_cents,
    promptTokenRatePer1k: row.prompt_token_rate_per_1k,
    completionTokenRatePer1k: row.completion_token_rate_per_1k,
    modelName: row.model_name,
    question: row.question,
    contextTokens: row.context_tokens,
    createdAt: row.created_at,
  }));
}
