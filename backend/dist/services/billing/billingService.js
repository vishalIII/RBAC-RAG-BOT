import pool from "../../config/db.js";
import { calculateTokenCost, getActivePricingRate } from "./usageTrackingService.js";
// ====================================================================
// GET COMPANY SUBSCRIPTION
// ====================================================================
export async function getCompanySubscription(companyId) {
    const result = await pool.query(`
    SELECT cs.id, cs.company_id, cs.plan_id, cs.billing_cycle_start_date,
           cs.billing_cycle_end_date, cs.prompt_tokens_used, cs.completion_tokens_used,
           cs.estimated_cost_cents, cs.status, cs.payment_method,
           cs.created_at, cs.updated_at,
           sp.name, sp.description, sp.monthly_prompt_tokens,
           sp.monthly_completion_tokens, sp.monthly_price_cents, sp.is_active
    FROM company_subscriptions cs
    JOIN subscription_plans sp ON cs.plan_id = sp.id
    WHERE cs.company_id = $1
    `, [companyId]);
    if (result.rows.length === 0) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row.id,
        companyId: row.company_id,
        planId: row.plan_id,
        billingCycleStartDate: new Date(row.billing_cycle_start_date),
        billingCycleEndDate: new Date(row.billing_cycle_end_date),
        promptTokensUsed: row.prompt_tokens_used,
        completionTokensUsed: row.completion_tokens_used,
        estimatedCostCents: row.estimated_cost_cents,
        status: row.status,
        paymentMethod: row.payment_method,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        plan: {
            id: row.plan_id,
            name: row.name,
            description: row.description,
            monthlyPromptTokens: row.monthly_prompt_tokens,
            monthlyCompletionTokens: row.monthly_completion_tokens,
            monthlyPriceCents: row.monthly_price_cents,
            isActive: row.is_active,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        },
    };
}
// ====================================================================
// CREATE COMPANY SUBSCRIPTION
// ====================================================================
export async function createCompanySubscription(companyId, planId) {
    // Calculate billing cycle (first day to last day of month)
    const now = new Date();
    const billingCycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const billingCycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const result = await pool.query(`
    INSERT INTO company_subscriptions (
      company_id, plan_id, billing_cycle_start_date, billing_cycle_end_date,
      prompt_tokens_used, completion_tokens_used, estimated_cost_cents,
      status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, 0, 0, 0, 'active', NOW(), NOW())
    ON CONFLICT (company_id)
    DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      status = 'active',
      updated_at = NOW()
    RETURNING id, company_id, plan_id, billing_cycle_start_date,
              billing_cycle_end_date, prompt_tokens_used, completion_tokens_used,
              estimated_cost_cents, status, payment_method, created_at, updated_at
    `, [companyId, planId, billingCycleStart, billingCycleEnd]);
    const subscription = result.rows[0];
    // Get plan details
    const planResult = await pool.query(`
    SELECT id, name, description, monthly_prompt_tokens,
           monthly_completion_tokens, monthly_price_cents, is_active,
           created_at, updated_at
    FROM subscription_plans WHERE id = $1
    `, [planId]);
    const plan = planResult.rows[0];
    return {
        id: subscription.id,
        companyId: subscription.company_id,
        planId: subscription.plan_id,
        billingCycleStartDate: new Date(subscription.billing_cycle_start_date),
        billingCycleEndDate: new Date(subscription.billing_cycle_end_date),
        promptTokensUsed: subscription.prompt_tokens_used,
        completionTokensUsed: subscription.completion_tokens_used,
        estimatedCostCents: subscription.estimated_cost_cents,
        status: subscription.status,
        paymentMethod: subscription.payment_method,
        createdAt: new Date(subscription.created_at),
        updatedAt: new Date(subscription.updated_at),
        plan: {
            id: plan.id,
            name: plan.name,
            description: plan.description,
            monthlyPromptTokens: plan.monthly_prompt_tokens,
            monthlyCompletionTokens: plan.monthly_completion_tokens,
            monthlyPriceCents: plan.monthly_price_cents,
            isActive: plan.is_active,
            createdAt: new Date(plan.created_at),
            updatedAt: new Date(plan.updated_at),
        },
    };
}
// ====================================================================
// UPGRADE/DOWNGRADE PLAN
// ====================================================================
export async function buySubscription(companyId, planId) {
    const existing = await getCompanySubscription(companyId);
    if (existing) {
        // company already has a subscription -> upgrade/downgrade to selected plan
        return changePlan(companyId, planId);
    }
    // first-time purchase -> create subscription row
    return createCompanySubscription(companyId, planId);
}
export async function changePlan(companyId, newPlanId) {
    const result = await pool.query(`
    UPDATE company_subscriptions
    SET plan_id = $2, updated_at = NOW()
    WHERE company_id = $1
    RETURNING id, company_id, plan_id, billing_cycle_start_date,
              billing_cycle_end_date, prompt_tokens_used, completion_tokens_used,
              estimated_cost_cents, status, payment_method, created_at, updated_at
    `, [companyId, newPlanId]);
    if (result.rows.length === 0) {
        throw new Error(`Subscription not found for company: ${companyId}`);
    }
    return getCompanySubscription(companyId);
}
// ====================================================================
// GENERATE MONTHLY INVOICE
// ====================================================================
export async function generateMonthlyInvoice(companyId) {
    const subscription = await getCompanySubscription(companyId);
    if (!subscription) {
        throw new Error(`No subscription found for company: ${companyId}`);
    }
    // Get current month usage
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];
    const usageResult = await pool.query(`
    SELECT SUM(prompt_tokens_used) as prompt_tokens,
           SUM(completion_tokens_used) as completion_tokens,
           SUM(total_tokens_used) as total_tokens,
           SUM(total_cost_cents) as total_cost_cents,
           COUNT(DISTINCT employee_id) as unique_employees,
           SUM(request_count) as request_count
    FROM daily_usage_aggregates
    WHERE company_id = $1 AND usage_date >= $2 AND usage_date <= $3
    `, [companyId, firstDay, lastDay]);
    const usage = usageResult.rows[0];
    const promptTokensUsed = parseInt(usage.prompt_tokens || 0);
    const completionTokensUsed = parseInt(usage.completion_tokens || 0);
    const totalTokensUsed = parseInt(usage.total_tokens || 0);
    const actualCostCents = parseInt(usage.total_cost_cents || 0);
    // Base plan cost (monthly subscription price)
    const basePlanCostCents = subscription.plan.monthlyPriceCents;
    // Calculate overage (if usage exceeds plan limits)
    const promptOverage = Math.max(0, promptTokensUsed - subscription.plan.monthlyPromptTokens);
    const completionOverage = Math.max(0, completionTokensUsed - subscription.plan.monthlyCompletionTokens);
    // Get overage pricing rate
    let overageCostCents = 0;
    if (promptOverage > 0 || completionOverage > 0) {
        const pricingRate = await getActivePricingRate("gemini-2.5-flash");
        const { totalCents } = calculateTokenCost(promptOverage, completionOverage, pricingRate.promptTokenRatePer1k, pricingRate.completionTokenRatePer1k);
        overageCostCents = totalCents;
    }
    // Calculate total
    const discountCents = 0; // Can be customized based on negotiated deals
    const totalAmountCents = basePlanCostCents + overageCostCents - discountCents;
    // Generate invoice number
    const invoiceNumber = `INV-${companyId.substring(0, 8).toUpperCase()}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    // Create invoice
    const invoiceResult = await pool.query(`
    INSERT INTO billing_invoices (
      company_id, subscription_id, invoice_number,
      billing_period_start, billing_period_end,
      prompt_tokens_used, completion_tokens_used, total_tokens_used,
      base_plan_cost_cents, overage_cost_cents, discount_cents,
      total_amount_cents, payment_status, due_date, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending',
      $13, NOW(), NOW()
    )
    RETURNING id, company_id, subscription_id, invoice_number,
              billing_period_start, billing_period_end,
              prompt_tokens_used, completion_tokens_used, total_tokens_used,
              base_plan_cost_cents, overage_cost_cents, discount_cents,
              total_amount_cents, payment_status, paid_at, due_date,
              notes, created_at, updated_at
    `, [
        companyId,
        subscription.id,
        invoiceNumber,
        firstDay,
        lastDay,
        promptTokensUsed,
        completionTokensUsed,
        totalTokensUsed,
        basePlanCostCents,
        overageCostCents,
        discountCents,
        totalAmountCents,
        new Date(now.getFullYear(), now.getMonth() + 1, 5), // Due 5 days into next month
    ]);
    const invoice = invoiceResult.rows[0];
    return {
        id: invoice.id,
        companyId: invoice.company_id,
        subscriptionId: invoice.subscription_id,
        invoiceNumber: invoice.invoice_number,
        billingPeriodStart: new Date(invoice.billing_period_start),
        billingPeriodEnd: new Date(invoice.billing_period_end),
        promptTokensUsed: invoice.prompt_tokens_used,
        completionTokensUsed: invoice.completion_tokens_used,
        totalTokensUsed: invoice.total_tokens_used,
        basePlanCostCents: invoice.base_plan_cost_cents,
        overageCostCents: invoice.overage_cost_cents,
        discountCents: invoice.discount_cents,
        totalAmountCents: invoice.total_amount_cents,
        paymentStatus: invoice.payment_status,
        paidAt: invoice.paid_at,
        dueDate: invoice.due_date,
        notes: invoice.notes,
        createdAt: new Date(invoice.created_at),
        updatedAt: new Date(invoice.updated_at),
    };
}
// ====================================================================
// RESET MONTHLY USAGE (Called at month boundary)
// ====================================================================
export async function resetMonthlyUsage(companyId) {
    // Create aggregate from previous month's daily data
    const previousMonth = new Date();
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    const yearMonth = new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 1).toISOString().split("T")[0];
    // Get all daily aggregates for the month and sum them
    const monthlyDataResult = await pool.query(`
    SELECT SUM(prompt_tokens_used) as prompt_tokens,
           SUM(completion_tokens_used) as completion_tokens,
           SUM(total_tokens_used) as total_tokens,
           SUM(total_cost_cents) as total_cost_cents,
           SUM(request_count) as request_count,
           COUNT(DISTINCT employee_id) as unique_employees
    FROM daily_usage_aggregates
    WHERE company_id = $1
    AND usage_date >= $2 AND usage_date < DATE($2 + INTERVAL '1 month')
    `, [companyId, yearMonth]);
    const monthlyData = monthlyDataResult.rows[0];
    // Insert or update monthly aggregate
    await pool.query(`
    INSERT INTO monthly_usage_aggregates (
      company_id, year_month,
      prompt_tokens_used, completion_tokens_used, total_tokens_used,
      total_cost_cents, request_count, unique_employees,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
    )
    ON CONFLICT (company_id, year_month)
    DO UPDATE SET
      prompt_tokens_used = EXCLUDED.prompt_tokens_used,
      completion_tokens_used = EXCLUDED.completion_tokens_used,
      total_tokens_used = EXCLUDED.total_tokens_used,
      total_cost_cents = EXCLUDED.total_cost_cents,
      request_count = EXCLUDED.request_count,
      unique_employees = EXCLUDED.unique_employees,
      updated_at = NOW()
    `, [
        companyId,
        yearMonth,
        parseInt(monthlyData.prompt_tokens || 0),
        parseInt(monthlyData.completion_tokens || 0),
        parseInt(monthlyData.total_tokens || 0),
        parseInt(monthlyData.total_cost_cents || 0),
        parseInt(monthlyData.request_count || 0),
        parseInt(monthlyData.unique_employees || 0),
    ]);
    // Reset subscription usage counters
    const now = new Date();
    const billingCycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const billingCycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    await pool.query(`
    UPDATE company_subscriptions
    SET prompt_tokens_used = 0,
        completion_tokens_used = 0,
        estimated_cost_cents = 0,
        billing_cycle_start_date = $2,
        billing_cycle_end_date = $3,
        updated_at = NOW()
    WHERE company_id = $1
    `, [companyId, billingCycleStart, billingCycleEnd]);
    // Log the reset in audit trail
    await pool.query(`
    INSERT INTO token_audit_trail (
      company_id, event_type, description, created_at
    ) VALUES (
      $1, 'monthly_reset', 'Monthly token usage reset', NOW()
    )
    `, [companyId]);
}
// ====================================================================
// GET BILLING HISTORY
// ====================================================================
export async function getBillingHistory(companyId, limit = 12) {
    const result = await pool.query(`
    SELECT id, company_id, subscription_id, invoice_number,
           billing_period_start, billing_period_end,
           prompt_tokens_used, completion_tokens_used, total_tokens_used,
           base_plan_cost_cents, overage_cost_cents, discount_cents,
           total_amount_cents, payment_status, paid_at, due_date,
           notes, created_at, updated_at
    FROM billing_invoices
    WHERE company_id = $1
    ORDER BY billing_period_end DESC
    LIMIT $2
    `, [companyId, limit]);
    return result.rows.map((row) => ({
        id: row.id,
        companyId: row.company_id,
        subscriptionId: row.subscription_id,
        invoiceNumber: row.invoice_number,
        billingPeriodStart: new Date(row.billing_period_start),
        billingPeriodEnd: new Date(row.billing_period_end),
        promptTokensUsed: row.prompt_tokens_used,
        completionTokensUsed: row.completion_tokens_used,
        totalTokensUsed: row.total_tokens_used,
        basePlanCostCents: row.base_plan_cost_cents,
        overageCostCents: row.overage_cost_cents,
        discountCents: row.discount_cents,
        totalAmountCents: row.total_amount_cents,
        paymentStatus: row.payment_status,
        paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
        dueDate: row.due_date ? new Date(row.due_date) : undefined,
        notes: row.notes,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    }));
}
// ====================================================================
// GET ALL SUBSCRIPTION PLANS
// ====================================================================
export async function getSubscriptionPlans() {
    const result = await pool.query(`
    SELECT id, name, description, monthly_prompt_tokens,
           monthly_completion_tokens, monthly_price_cents, is_active,
           created_at, updated_at
    FROM subscription_plans
    WHERE is_active = true
    ORDER BY monthly_price_cents ASC
    `);
    return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        monthlyPromptTokens: row.monthly_prompt_tokens,
        monthlyCompletionTokens: row.monthly_completion_tokens,
        monthlyPriceCents: row.monthly_price_cents,
        isActive: row.is_active,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    }));
}
// ====================================================================
// MARK INVOICE AS PAID
// ====================================================================
export async function markInvoiceAsPaid(invoiceId) {
    await pool.query(`
    UPDATE billing_invoices
    SET payment_status = 'paid', paid_at = NOW(), updated_at = NOW()
    WHERE id = $1
    `, [invoiceId]);
}
// ====================================================================
// GET AUDIT TRAIL
// ====================================================================
export async function getAuditTrail(companyId, limit = 100) {
    const result = await pool.query(`
    SELECT id, company_id, event_type, description,
           before_prompt_tokens, before_completion_tokens,
           after_prompt_tokens, after_completion_tokens,
           modified_by, created_at
    FROM token_audit_trail
    WHERE company_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `, [companyId, limit]);
    return result.rows.map((row) => ({
        id: row.id,
        companyId: row.company_id,
        eventType: row.event_type,
        description: row.description,
        beforePromptTokens: row.before_prompt_tokens,
        beforeCompletionTokens: row.before_completion_tokens,
        afterPromptTokens: row.after_prompt_tokens,
        afterCompletionTokens: row.after_completion_tokens,
        modifiedBy: row.modified_by,
        createdAt: new Date(row.created_at),
    }));
}
