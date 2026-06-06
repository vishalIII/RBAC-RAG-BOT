import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { requireCompany } from "../../middleware/company.middleware.js";
import { getCompanyUsageStats, getTopEmployeesByUsage, getUsageByDepartment, getUsageTrend7Days, getPlanLimitStatus, getUsageBreakdown, getCostProjection, } from "../../services/billing/analyticsService.js";
import { getCompanySubscription, getBillingHistory, getSubscriptionPlans, buySubscription, } from "../../services/billing/billingService.js";
import { getUsageLogs } from "../../services/billing/usageTrackingService.js";
import pool from "../../config/db.js";
const router = Router();
// ====================================================================
// PUBLIC ENDPOINTS (Available to authenticated users)
// ====================================================================
/**
 * Get Available Plans
 * GET /api/billing/plans
 */
router.get("/plans", authenticate, async (_req, res) => {
    try {
        const plans = await getSubscriptionPlans();
        res.json(plans);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ====================================================================
// COMPANY OWNER ENDPOINTS (Dashboard & Management)
// ====================================================================
/**
 * Get Comprehensive Dashboard
 * GET /api/billing/dashboard
 *
 * Returns:
 * - Current month usage and cost
 * - Previous month comparison
 * - Today's usage
 * - Plan limits and reset date
 * - 7-day usage trend
 * - Usage breakdown and insights
 */
router.get("/dashboard", authenticate, requireCompany, authorize("owner"), async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Company ID not found" });
        }
        const [stats, limits, trend, breakdown] = await Promise.all([
            getCompanyUsageStats(companyId),
            getPlanLimitStatus(companyId),
            getUsageTrend7Days(companyId),
            getUsageBreakdown(companyId),
        ]);
        res.json({
            stats,
            limits,
            trend,
            breakdown,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get Top Employees by Usage
 * GET /api/billing/employees?limit=20
 *
 * Shows which employees are using the most tokens
 */
router.get("/employees", authenticate, requireCompany, authorize("owner", "manager"), async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Company ID not found" });
        }
        const limit = Math.min(parseInt(req.query.limit || "20"), 100);
        const employees = await getTopEmployeesByUsage(companyId, limit);
        res.json(employees);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get Usage by Department
 * GET /api/billing/departments
 *
 * Shows token usage and employee count by department
 */
router.get("/departments", authenticate, requireCompany, authorize("owner"), async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Company ID not found" });
        }
        const departments = await getUsageByDepartment(companyId);
        res.json(departments);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get Current Subscription
 * GET /api/billing/subscription
 *
 * Returns company's active plan, limits, and current usage
 */
router.get("/subscription", authenticate, requireCompany, authorize("owner"), async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Company ID not found" });
        }
        const subscription = await getCompanySubscription(companyId);
        if (!subscription) {
            return res
                .status(404)
                .json({ error: "No active subscription found" });
        }
        res.json(subscription);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * Upgrade or Downgrade Plan
 * POST /api/billing/upgrade
 *
 * Body: { planId: "uuid" }
 */
router.post("/buy", authenticate, requireCompany, authorize("owner"), async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Company ID not found" });
        }
        const { planId } = req.body;
        if (!planId) {
            return res.status(400).json({ error: "planId is required" });
        }
        const subscription = await buySubscription(companyId, planId);
        res.json(subscription);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get Billing History
 * GET /api/billing/invoices?limit=12
 *
 * Returns list of monthly invoices
 */
router.get("/invoices", authenticate, requireCompany, authorize("owner"), async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Company ID not found" });
        }
        const limit = Math.min(parseInt(req.query.limit || "12"), 100);
        const invoices = await getBillingHistory(companyId, limit);
        res.json(invoices);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get Cost Projection
 * GET /api/billing/cost-projection
 *
 * Estimates end-of-month cost based on current usage
 */
router.get("/cost-projection", authenticate, requireCompany, authorize("owner"), async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Company ID not found" });
        }
        const projection = await getCostProjection(companyId);
        res.json(projection);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get 7-Day Usage Trend
 * GET /api/billing/trend
 *
 * Returns daily breakdown for past 7 days
 */
router.get("/trend", authenticate, requireCompany, authorize("owner", "manager"), async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Company ID not found" });
        }
        const trend = await getUsageTrend7Days(companyId);
        res.json(trend);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get Plan Limit Status
 * GET /api/billing/limits
 *
 * Shows current usage vs limits for prompt and completion tokens
 */
router.get("/limits", authenticate, requireCompany, authorize("owner"), async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Company ID not found" });
        }
        const limits = await getPlanLimitStatus(companyId);
        res.json(limits);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get Usage Logs / Audit Trail
 * GET /api/billing/logs?limit=100&offset=0
 *
 * Returns detailed token usage log for audit purposes
 */
router.get("/logs", authenticate, requireCompany, authorize("owner"), async (req, res) => {
    try {
        const companyId = req.user?.companyId;
        if (!companyId) {
            return res.status(401).json({ error: "Company ID not found" });
        }
        const limit = Math.min(parseInt(req.query.limit || "100"), 500);
        const offset = Math.max(parseInt(req.query.offset || "0"), 0);
        const logs = await getUsageLogs(companyId, limit, offset);
        res.json({
            limit,
            offset,
            count: logs.length,
            data: logs,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ====================================================================
// EMPLOYEE ENDPOINTS (Personal Usage)
// ====================================================================
/**
 * Get My Usage (Employee Only)
 * GET /api/billing/my-usage
 *
 * Shows the current employee's personal usage
 */
router.get("/my-usage", authenticate, async (req, res) => {
    try {
        const employeeId = req.employee?.id;
        if (!employeeId) {
            return res.status(401).json({ error: "Employee not found" });
        }
        // Get today's usage
        const employees = await getTopEmployeesByUsage("", 1000);
        const myUsage = employees.find((e) => e.employeeId === employeeId);
        if (!myUsage) {
            return res.json({
                employeeId,
                employeeName: req.employee?.first_name,
                currentMonth: {
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0,
                    costCents: 0,
                },
                today: {
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0,
                    costCents: 0,
                    requestCount: 0,
                },
            });
        }
        res.json(myUsage);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ====================================================================
// ADMIN ENDPOINTS (Platform Admin Only)
// ====================================================================
/**
 * Trigger Monthly Billing Job (Manual)
 * POST /api/billing/admin/trigger-billing
 *
 * For testing - manually trigger the monthly billing process
 */
router.post("/admin/trigger-billing", authenticate, authorize("platform_admin"), async (req, res) => {
    try {
        const { executeMonthlyBillingJob } = await import("../../jobs/monthlyBillingJob.js");
        const companyId = req.query.companyId || undefined;
        if (companyId) {
            // Trigger for specific company
            const { generateMonthlyInvoice, resetMonthlyUsage } = await import("../../services/billing/billingService.js");
            const invoice = await generateMonthlyInvoice(companyId);
            await resetMonthlyUsage(companyId);
            res.json({
                success: true,
                message: `Billing processed for company: ${companyId}`,
                invoice: {
                    invoiceNumber: invoice.invoiceNumber,
                    totalAmount: (invoice.totalAmountCents / 100).toFixed(2),
                    status: invoice.paymentStatus,
                },
            });
        }
        else {
            // Trigger for all companies
            const result = await executeMonthlyBillingJob();
            res.json({
                success: result.success,
                message: "Monthly billing job completed",
                summary: {
                    companiesProcessed: result.companiesProcessed,
                    invoicesGenerated: result.invoicesGenerated,
                    duration: `${result.duration}ms`,
                    errors: result.errors.length > 0 ? result.errors : "None",
                },
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
/**
 * Get All Companies Usage (For Platform Admin)
 * GET /api/billing/admin/companies-usage
 */
router.get("/admin/companies-usage", authenticate, authorize("platform_admin"), async (_req, res) => {
    try {
        // Get usage for all companies
        const result = await pool.query(`
        SELECT
          c.id,
          c.name,
          cs.prompt_tokens_used,
          cs.completion_tokens_used,
          cs.estimated_cost_cents,
          sp.name as plan_name,
          cs.status,
          cs.created_at,
          cs.updated_at
        FROM companies c
        LEFT JOIN company_subscriptions cs ON c.id = cs.company_id
        LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id
        WHERE c.is_active = true
        ORDER BY cs.estimated_cost_cents DESC
        `);
        res.json(result.rows.map((row) => ({
            companyId: row.id,
            companyName: row.name,
            plan: row.plan_name,
            status: row.status,
            promptTokensUsed: row.prompt_tokens_used,
            completionTokensUsed: row.completion_tokens_used,
            monthlyEstimate: (row.estimated_cost_cents / 100).toFixed(2),
            createdAt: row.created_at,
            lastUpdated: row.updated_at,
        })));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
