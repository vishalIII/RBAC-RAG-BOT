import pool from "../../config/db.js";
// ====================================================================
// COMPANY USAGE STATS (Dashboard)
// ====================================================================
export async function getCompanyUsageStats(companyId) {
    // Get current month data
    const currentMonthResult = await pool.query(`
    SELECT
      SUM(prompt_tokens_used) as prompt_tokens,
      SUM(completion_tokens_used) as completion_tokens,
      SUM(COALESCE(total_tokens_used, prompt_tokens_used + completion_tokens_used)) as total_tokens,
      SUM(total_cost_cents) as total_cost_cents
    FROM daily_usage_aggregates
    WHERE company_id = $1
    AND usage_date >= DATE_TRUNC('month', NOW())
    AND usage_date < DATE_TRUNC('month', NOW() + INTERVAL '1 month')
    `, [companyId]);
    // Get previous month data
    const previousMonthResult = await pool.query(`
    SELECT
      SUM(prompt_tokens_used) as prompt_tokens,
      SUM(completion_tokens_used) as completion_tokens,
      SUM(COALESCE(total_tokens_used, prompt_tokens_used + completion_tokens_used)) as total_tokens,
      SUM(total_cost_cents) as total_cost_cents
    FROM daily_usage_aggregates
    WHERE company_id = $1
    AND usage_date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
    AND usage_date < DATE_TRUNC('month', NOW())
    `, [companyId]);
    // Get today's data
    const todayResult = await pool.query(`
    SELECT
      SUM(prompt_tokens_used) as prompt_tokens,
      SUM(completion_tokens_used) as completion_tokens,
      SUM(total_tokens_used) as total_tokens,
      SUM(total_cost_cents) as total_cost_cents,
      SUM(request_count) as request_count
    FROM daily_usage_aggregates
    WHERE company_id = $1
    AND usage_date = CURRENT_DATE
    `, [companyId]);
    // Get plan limit
    const subscriptionResult = await pool.query(`
    SELECT sp.monthly_prompt_tokens, sp.monthly_completion_tokens
    FROM company_subscriptions cs
    JOIN subscription_plans sp ON cs.plan_id = sp.id
    WHERE cs.company_id = $1 AND cs.status = 'active'
    `, [companyId]);
    const currentMonth = currentMonthResult.rows[0];
    const previousMonth = previousMonthResult.rows[0];
    const today = todayResult.rows[0];
    const subscription = subscriptionResult.rows[0];
    const currentPromptTokens = parseInt(currentMonth?.prompt_tokens || 0);
    const currentCompletionTokens = parseInt(currentMonth?.completion_tokens || 0);
    const totalTokens = currentPromptTokens + currentCompletionTokens;
    const monthlyLimit = subscription
        ? subscription.monthly_prompt_tokens +
            subscription.monthly_completion_tokens
        : 1000000;
    return {
        companyId,
        currentMonth: {
            promptTokens: currentPromptTokens,
            completionTokens: currentCompletionTokens,
            totalTokens,
            costCents: parseInt(currentMonth?.total_cost_cents || 0),
            percentOfLimit: Math.min(100, Math.round((totalTokens / monthlyLimit) * 100)),
        },
        previousMonth: {
            promptTokens: parseInt(previousMonth?.prompt_tokens || 0),
            completionTokens: parseInt(previousMonth?.completion_tokens || 0),
            totalTokens: parseInt(previousMonth?.total_tokens || 0),
            costCents: parseInt(previousMonth?.total_cost_cents || 0),
        },
        today: {
            promptTokens: parseInt(today?.prompt_tokens || 0),
            completionTokens: parseInt(today?.completion_tokens || 0),
            totalTokens: parseInt(today?.total_tokens || 0),
            costCents: parseInt(today?.total_cost_cents || 0),
            requestCount: parseInt(today?.request_count || 0),
        },
    };
}
// ====================================================================
// TOP EMPLOYEES BY USAGE
// ====================================================================
export async function getTopEmployeesByUsage(companyId, limit = 10) {
    const result = await pool.query(`
    SELECT
      e.id,
      CONCAT(e.first_name, ' ', e.last_name) as name,
      SUM(CASE
        WHEN dua.usage_date >= DATE_TRUNC('month', NOW())
        AND dua.usage_date < DATE_TRUNC('month', NOW() + INTERVAL '1 month')
        THEN dua.prompt_tokens_used
        ELSE 0
      END) as current_month_prompt,
      SUM(CASE
        WHEN dua.usage_date >= DATE_TRUNC('month', NOW())
        AND dua.usage_date < DATE_TRUNC('month', NOW() + INTERVAL '1 month')
        THEN dua.completion_tokens_used
        ELSE 0
      END) as current_month_completion,
      SUM(CASE
        WHEN dua.usage_date >= DATE_TRUNC('month', NOW())
        AND dua.usage_date < DATE_TRUNC('month', NOW() + INTERVAL '1 month')
        THEN COALESCE(dua.total_tokens_used, dua.prompt_tokens_used + dua.completion_tokens_used)
        ELSE 0
      END) as current_month_total,
      SUM(CASE
        WHEN dua.usage_date >= DATE_TRUNC('month', NOW())
        AND dua.usage_date < DATE_TRUNC('month', NOW() + INTERVAL '1 month')
        THEN dua.total_cost_cents
        ELSE 0
      END) as current_month_cost,
      SUM(CASE
        WHEN dua.usage_date = CURRENT_DATE
        THEN dua.prompt_tokens_used
        ELSE 0
      END) as today_prompt,
      SUM(CASE
        WHEN dua.usage_date = CURRENT_DATE
        THEN dua.completion_tokens_used
        ELSE 0
      END) as today_completion,
      SUM(CASE
        WHEN dua.usage_date = CURRENT_DATE
        THEN dua.total_tokens_used
        ELSE 0
      END) as today_total,
      SUM(CASE
        WHEN dua.usage_date = CURRENT_DATE
        THEN dua.total_cost_cents
        ELSE 0
      END) as today_cost,
      SUM(CASE
        WHEN dua.usage_date = CURRENT_DATE
        THEN dua.request_count
        ELSE 0
      END) as today_requests
    FROM employees e
    LEFT JOIN daily_usage_aggregates dua ON e.id = dua.employee_id
    WHERE e.company_id = $1
    GROUP BY e.id, e.first_name, e.last_name
    ORDER BY current_month_total DESC
    LIMIT $2
    `, [companyId, limit]);
    return result.rows.map((row) => ({
        employeeId: row.id,
        employeeName: row.name,
        currentMonth: {
            promptTokens: parseInt(row.current_month_prompt || 0),
            completionTokens: parseInt(row.current_month_completion || 0),
            totalTokens: parseInt(row.current_month_total || 0),
            costCents: parseInt(row.current_month_cost || 0),
        },
        today: {
            promptTokens: parseInt(row.today_prompt || 0),
            completionTokens: parseInt(row.today_completion || 0),
            totalTokens: parseInt(row.today_total || 0),
            costCents: parseInt(row.today_cost || 0),
            requestCount: parseInt(row.today_requests || 0),
        },
    }));
}
// ====================================================================
// USAGE BREAKDOWN BY DEPARTMENT
// ====================================================================
export async function getUsageByDepartment(companyId) {
    const result = await pool.query(`
    SELECT
      d.id as department_id,
      d.name as department_name,
      SUM(dua.prompt_tokens_used) as prompt_tokens,
      SUM(dua.completion_tokens_used) as completion_tokens,
      SUM(COALESCE(dua.total_tokens_used, dua.prompt_tokens_used + dua.completion_tokens_used)) as total_tokens,
      SUM(dua.total_cost_cents) as total_cost_cents,
      COUNT(DISTINCT dua.employee_id) as employee_count
    FROM departments d
    LEFT JOIN employees e ON d.id = e.department_id
    LEFT JOIN daily_usage_aggregates dua ON e.id = dua.employee_id
    WHERE d.company_id = $1
    AND dua.usage_date >= DATE_TRUNC('month', NOW())
    AND dua.usage_date < DATE_TRUNC('month', NOW() + INTERVAL '1 month')
    GROUP BY d.id, d.name
    ORDER BY total_tokens DESC
    `, [companyId]);
    return result.rows.map((row) => ({
        departmentId: row.department_id,
        departmentName: row.department_name,
        promptTokens: parseInt(row.prompt_tokens || 0),
        completionTokens: parseInt(row.completion_tokens || 0),
        totalTokens: parseInt(row.total_tokens || 0),
        costCents: parseInt(row.total_cost_cents || 0),
        employeeCount: parseInt(row.employee_count || 0),
    }));
}
// ====================================================================
// DAILY USAGE TREND (7 days)
// ====================================================================
export async function getUsageTrend7Days(companyId) {
    const result = await pool.query(`
    SELECT
      usage_date,
      SUM(prompt_tokens_used) as prompt_tokens,
      SUM(completion_tokens_used) as completion_tokens,
      SUM(total_tokens_used) as total_tokens,
      SUM(total_cost_cents) as total_cost_cents,
      SUM(request_count) as request_count
    FROM daily_usage_aggregates
    WHERE company_id = $1
    AND usage_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY usage_date
    ORDER BY usage_date ASC
    `, [companyId]);
    return result.rows.map((row) => ({
        date: row.usage_date.toISOString().split("T")[0],
        promptTokens: parseInt(row.prompt_tokens || 0),
        completionTokens: parseInt(row.completion_tokens || 0),
        totalTokens: parseInt(row.total_tokens || 0),
        costCents: parseInt(row.total_cost_cents || 0),
        requestCount: parseInt(row.request_count || 0),
    }));
}
// ====================================================================
// MONTHLY COMPARISON (Last 6 months)
// ====================================================================
export async function getMonthlyComparison() {
    const result = await pool.query(`
    SELECT
      year_month,
      SUM(prompt_tokens_used) AS prompt_tokens,
      SUM(completion_tokens_used) AS completion_tokens,
      SUM(total_tokens_used) AS total_tokens,
      SUM(total_cost_cents) AS total_cost_cents
    FROM monthly_usage_aggregates
    WHERE year_month >= DATE_TRUNC('month', NOW() - INTERVAL '6 months')
    GROUP BY year_month
    ORDER BY year_month DESC
  `);
    return result.rows.map((row) => ({
        month: new Date(row.year_month).toISOString().split("T")[0],
        promptTokens: Number(row.prompt_tokens ?? 0),
        completionTokens: Number(row.completion_tokens ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        costCents: Number(row.total_cost_cents ?? 0),
    }));
}
// =========================================================================================
// PLAN LIMIT STATUS
// ====================================================================
export async function getPlanLimitStatus(companyId) {
    const result = await pool.query(`
    SELECT
      cs.id,
      cs.prompt_tokens_used,
      cs.completion_tokens_used,
      cs.billing_cycle_end_date,
      sp.name as plan_name,
      sp.monthly_prompt_tokens,
      sp.monthly_completion_tokens
    FROM company_subscriptions cs
    JOIN subscription_plans sp ON cs.plan_id = sp.id
    WHERE cs.company_id = $1 AND cs.status = 'active'
    `, [companyId]);
    if (result.rows.length === 0) {
        throw new Error(`No active subscription for company: ${companyId}`);
    }
    const row = result.rows[0];
    const now = new Date();
    const resetDate = new Date(row.billing_cycle_end_date);
    const daysRemaining = Math.ceil((resetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const promptPercentUsed = Math.round((row.prompt_tokens_used / row.monthly_prompt_tokens) * 100);
    const completionPercentUsed = Math.round((row.completion_tokens_used / row.monthly_completion_tokens) * 100);
    return {
        subscriptionId: row.id,
        planName: row.plan_name,
        monthlyPromptLimit: row.monthly_prompt_tokens,
        monthlyCompletionLimit: row.monthly_completion_tokens,
        promptTokensUsed: row.prompt_tokens_used,
        completionTokensUsed: row.completion_tokens_used,
        promptPercentUsed,
        completionPercentUsed,
        daysRemainingInCycle: Math.max(0, daysRemaining),
        resetDate,
    };
}
// ====================================================================
// USAGE BREAKDOWN & INSIGHTS
// ====================================================================
export async function getUsageBreakdown(companyId) {
    // Get all usage this month
    const usageResult = await pool.query(`
    SELECT
    COUNT(*) as total_requests,
    ROUND(AVG(total_tokens)::numeric, 0)::int as avg_tokens,
    ROUND(AVG(total_cost_cents)::numeric, 0)::int as avg_cost
    FROM token_usage_logs
    WHERE company_id = $1
    AND created_at >= DATE_TRUNC('month', NOW())
    `, [companyId]);
    // Get peak usage day
    const peakResult = await pool.query(`
    SELECT usage_date
    FROM daily_usage_aggregates
    WHERE company_id = $1
    AND usage_date >= DATE_TRUNC('month', NOW())
    ORDER BY COALESCE(total_tokens_used, prompt_tokens_used + completion_tokens_used) DESC
    LIMIT 1
    `, [companyId]);
    // Get top employees
    const topEmployeesResult = await pool.query(`
    SELECT
      e.id,
      CONCAT(e.first_name, ' ', e.last_name) as name,
      SUM(COALESCE(dua.total_tokens_used, dua.prompt_tokens_used + dua.completion_tokens_used)) as tokens,
      SUM(dua.total_cost_cents) as cost
    FROM employees e
    LEFT JOIN daily_usage_aggregates dua ON e.id = dua.employee_id
    WHERE e.company_id = $1
    AND dua.usage_date >= DATE_TRUNC('month', NOW())
    GROUP BY e.id, e.first_name, e.last_name
    ORDER BY tokens DESC
    LIMIT 5
    `, [companyId]);
    const usage = usageResult.rows[0];
    const peak = peakResult.rows[0];
    return {
        totalRequests: parseInt(usage?.total_requests || 0),
        avgTokensPerRequest: usage?.avg_tokens || 0,
        avgCostPerRequest: usage?.avg_cost || 0,
        peakUsageDay: peak?.usage_date,
        topEmployees: topEmployeesResult.rows.map((row) => ({
            employeeId: row.id,
            name: row.name,
            tokens: parseInt(row.tokens || 0),
            costCents: parseInt(row.cost || 0),
        })),
    };
}
// ====================================================================
// COST PROJECTION (Based on current usage)
// ====================================================================
export async function getCostProjection(companyId) {
    const subscription = await getCompanySubscription(companyId);
    if (!subscription) {
        throw new Error("No subscription found");
    }
    // Get current month usage
    const currentUsage = await pool.query(`
    SELECT
      SUM(prompt_tokens_used) as prompt_tokens,
      SUM(completion_tokens_used) as completion_tokens
    FROM daily_usage_aggregates
    WHERE company_id = $1
    AND usage_date >= DATE_TRUNC('month', NOW())
    `, [companyId]);
    const usage = currentUsage.rows[0];
    const promptUsed = parseInt(usage?.prompt_tokens || 0);
    const completionUsed = parseInt(usage?.completion_tokens || 0);
    // Calculate daily average
    const daysElapsed = Math.max(1, new Date().getDate());
    const dailyPromptAvg = Math.ceil(promptUsed / daysElapsed);
    const dailyCompletionAvg = Math.ceil(completionUsed / daysElapsed);
    // Project to end of month
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - new Date().getDate();
    const projectedPrompt = promptUsed + dailyPromptAvg * daysRemaining;
    const projectedCompletion = completionUsed + dailyCompletionAvg * daysRemaining;
    // Calculate costs
    const basePlanCost = subscription.plan.monthlyPriceCents;
    const promptOverage = Math.max(0, projectedPrompt - subscription.plan.monthlyPromptTokens);
    const completionOverage = Math.max(0, projectedCompletion - subscription.plan.monthlyCompletionTokens);
    const overageCost = Math.ceil((promptOverage / 1000) * 1 + (completionOverage / 1000) * 4);
    return {
        basePlanCost,
        projectedOverageCost: overageCost,
        projectedTotalCost: basePlanCost + overageCost,
        daysRemaining: Math.max(0, daysRemaining),
        projectionAccuracy: `${Math.min(daysElapsed * 10, 100)}%`, // More days = more accurate
    };
}
// ====================================================================
// HELPER: Get company subscription
// ====================================================================
async function getCompanySubscription(companyId) {
    const result = await pool.query(`
    SELECT sp.monthly_prompt_tokens, sp.monthly_completion_tokens, sp.monthly_price_cents
    FROM company_subscriptions cs
    JOIN subscription_plans sp ON cs.plan_id = sp.id
    WHERE cs.company_id = $1 AND cs.status = 'active'
    `, [companyId]);
    if (result.rows.length === 0) {
        return undefined;
    }
    const row = result.rows[0];
    return {
        plan: {
            monthlyPromptTokens: row.monthly_prompt_tokens,
            monthlyCompletionTokens: row.monthly_completion_tokens,
            monthlyPriceCents: row.monthly_price_cents,
        },
    };
}
