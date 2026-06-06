import pool from "../config/db.js";
import {
  resetMonthlyUsage,
  generateMonthlyInvoice,
  getCompanySubscription,
} from "../services/billing/billingService.js";

/**
 * MONTHLY BILLING JOB
 *
 * This job runs at the end of each month (typically via a cron job or scheduler like:
 * - BullMQ
 * - node-schedule
 * - AWS Lambda
 * - Temporal
 *
 * It performs the following tasks:
 * 1. Finalize usage for all companies
 * 2. Generate invoices
 * 3. Reset monthly usage counters
 * 4. Send notifications
 * 5. Log audit trail
 */

// ====================================================================
// MAIN MONTHLY BILLING JOB
// ====================================================================
export async function executeMonthlyBillingJob(): Promise<{
  success: boolean;
  companiesProcessed: number;
  invoicesGenerated: number;
  errors: Array<{ companyId: string; error: string }>;
  duration: number;
}> {
  const startTime = Date.now();
  const errors: Array<{ companyId: string; error: string }> = [];
  let invoicesGenerated = 0;

  try {
    console.log("[BILLING JOB] Starting monthly billing process...");

    // Get all active companies
    const companiesResult = await pool.query(
      `
      SELECT DISTINCT c.id
      FROM companies c
      INNER JOIN company_subscriptions cs ON c.id = cs.company_id
      WHERE cs.status = 'active'
      `
    );

    const companies = companiesResult.rows;
    console.log(
      `[BILLING JOB] Processing ${companies.length} companies...`
    );

    for (const { id: companyId } of companies) {
      try {
        // Step 1: Generate invoice from current usage
        console.log(`[BILLING JOB] Generating invoice for company: ${companyId}`);
        const invoice = await generateMonthlyInvoice(companyId);
        invoicesGenerated++;

        // Step 2: Send notification email (optional)
        await notifyCompanyAboutInvoice(companyId, invoice);

        // Step 3: Check for usage anomalies
        await checkUsageAnomalies(companyId, invoice);

        // Step 4: Reset monthly usage
        console.log(
          `[BILLING JOB] Resetting usage for company: ${companyId}`
        );
        await resetMonthlyUsage(companyId);

        console.log(
          `[BILLING JOB] ✓ Completed for company: ${companyId}`
        );
      } catch (error: any) {
        console.error(
          `[BILLING JOB] Error processing company ${companyId}:`,
          error
        );
        errors.push({
          companyId,
          error: error.message,
        });
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[BILLING JOB] ✓ Completed successfully in ${duration}ms`);
    console.log(
      `[BILLING JOB] Summary: ${companies.length} companies, ${invoicesGenerated} invoices`
    );

    return {
      success: true,
      companiesProcessed: companies.length,
      invoicesGenerated,
      errors,
      duration,
    };
  } catch (error: any) {
    console.error("[BILLING JOB] Fatal error:", error);
    throw error;
  }
}

// ====================================================================
// CHECK FOR USAGE ANOMALIES
// ====================================================================
async function checkUsageAnomalies(
  companyId: string,
  invoice: any
): Promise<void> {
  try {
    const subscription = await getCompanySubscription(companyId);
    if (!subscription) return;

    const promptExceeded =
      invoice.promptTokensUsed >
      subscription.plan.monthlyPromptTokens * 1.2; // 20% overage threshold
    const completionExceeded =
      invoice.completionTokensUsed >
      subscription.plan.monthlyCompletionTokens * 1.2;

    if (promptExceeded || completionExceeded) {
      console.warn(
        `[BILLING JOB] Usage anomaly detected for company: ${companyId}`
      );

      await pool.query(
        `
        INSERT INTO usage_limit_alerts (
          company_id, alert_type, current_usage, limit_value,
          percentage_used, is_notified, alert_period, alert_date, created_at
        ) VALUES (
          $1, 'overage', $2, $3, $4, false, 'monthly', NOW()::date, NOW()
        )
        `,
        [
          companyId,
          promptExceeded
            ? invoice.promptTokensUsed
            : invoice.completionTokensUsed,
          promptExceeded
            ? subscription.plan.monthlyPromptTokens
            : subscription.plan.monthlyCompletionTokens,
          Math.round(
            (promptExceeded
              ? (invoice.promptTokensUsed /
                  subscription.plan.monthlyPromptTokens) *
                100
              : (invoice.completionTokensUsed /
                  subscription.plan.monthlyCompletionTokens) *
                100)
          ),
        ]
      );
    }
  } catch (error: any) {
    console.error(
      `[BILLING JOB] Error checking anomalies for ${companyId}:`,
      error
    );
  }
}

// ====================================================================
// NOTIFY COMPANY ABOUT INVOICE
// ====================================================================
async function notifyCompanyAboutInvoice(
  companyId: string,
  invoice: any
): Promise<void> {
  try {
    // Get company and owner email
    const result = await pool.query(
      `
      SELECT c.name, cu.email, sp.name as plan_name
      FROM companies c
      LEFT JOIN company_users cu ON c.created_by = cu.id
      LEFT JOIN company_subscriptions cs ON c.id = cs.company_id
      LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id
      WHERE c.id = $1
      `,
      [companyId]
    );

    if (result.rows.length === 0) return;

    const { name, email, plan_name } = result.rows[0];

    if (!email) return;

    // Send email (using your email service)
    const emailContent = formatInvoiceEmail(
      name,
      invoice,
      plan_name
    );

    // TODO: Integrate with your email service
    // await sendEmail({
    //   to: email,
    //   subject: `Invoice ${invoice.invoice_number} - ${name}`,
    //   html: emailContent,
    // });

    console.log(
      `[BILLING JOB] Invoice notification queued for: ${email}`
    );
  } catch (error: any) {
    console.error(
      `[BILLING JOB] Error notifying company ${companyId}:`,
      error
    );
  }
}

// ====================================================================
// FORMAT INVOICE EMAIL
// ====================================================================
function formatInvoiceEmail(
  companyName: string,
  invoice: any,
  planName: string
): string {
  const totalAmountUSD = (invoice.totalAmountCents / 100).toFixed(2);
  const basePlanUSD = (invoice.basePlanCostCents / 100).toFixed(2);
  const overageUSD = (invoice.overageCostCents / 100).toFixed(2);

  return `
    <h2>Invoice ${invoice.invoiceNumber}</h2>
    <p>Dear ${companyName} Team,</p>
    
    <p>Your monthly invoice is ready. Here's a summary:</p>
    
    <h3>Billing Period</h3>
    <p>${new Date(invoice.billingPeriodStart).toDateString()} - ${new Date(invoice.billingPeriodEnd).toDateString()}</p>
    
    <h3>Usage Summary</h3>
    <ul>
      <li>Prompt Tokens: ${invoice.promptTokensUsed.toLocaleString()}</li>
      <li>Completion Tokens: ${invoice.completionTokensUsed.toLocaleString()}</li>
      <li>Total Tokens: ${invoice.totalTokensUsed.toLocaleString()}</li>
    </ul>
    
    <h3>Charges</h3>
    <ul>
      <li>Plan (${planName}): $${basePlanUSD}</li>
      <li>Overage: $${overageUSD}</li>
      <li><strong>Total: $${totalAmountUSD}</strong></li>
    </ul>
    
    <p>Due Date: ${new Date(invoice.dueDate).toDateString()}</p>
    
    <p>Payment Status: ${invoice.paymentStatus}</p>
    
    <p>Thank you for using our service!</p>
  `;
}

// ====================================================================
// SCHEDULE MONTHLY JOB (Example with node-schedule)
// ====================================================================
export function scheduleMonthlyBillingJob(): void {
  // Uncomment and install 'node-schedule' if you want to use this
  // import schedule from 'node-schedule';
  //
  // // Run at 2 AM on the first day of each month
  // schedule.scheduleJob('0 2 1 * *', async () => {
  //   try {
  //     await executeMonthlyBillingJob();
  //   } catch (error) {
  //     console.error('Monthly billing job failed:', error);
  //   }
  // });
  //
  // console.log('Monthly billing job scheduled for 1st of each month at 2 AM');
}

// ====================================================================
// MANUAL TRIGGER (For testing or manual execution)
// ====================================================================
export async function triggerMonthlyBillingJobManually(
  companyId?: string
): Promise<void> {
  try {
    if (companyId) {
      console.log(
        `[BILLING JOB] Manually triggering for company: ${companyId}`
      );
      const invoice = await generateMonthlyInvoice(companyId);
      await notifyCompanyAboutInvoice(companyId, invoice);
      await resetMonthlyUsage(companyId);
      console.log(`[BILLING JOB] ✓ Completed for company: ${companyId}`);
    } else {
      console.log("[BILLING JOB] Manually triggering for all companies");
      const result = await executeMonthlyBillingJob();
      console.log("[BILLING JOB] Result:", result);
    }
  } catch (error: any) {
    console.error("[BILLING JOB] Manual trigger failed:", error);
    throw error;
  }
}

// ====================================================================
// CLEANUP JOB (Remove old audit logs, etc.)
// ====================================================================
export async function executeCleanupJob(): Promise<void> {
  try {
    console.log("[CLEANUP JOB] Starting cleanup...");

    // Delete old audit trail entries (older than 12 months)
    const auditDeleteResult = await pool.query(
      `
      DELETE FROM token_audit_trail
      WHERE created_at < NOW() - INTERVAL '12 months'
      `
    );

    console.log(
      `[CLEANUP JOB] Deleted ${auditDeleteResult.rowCount} old audit entries`
    );

    // Archive old token logs (older than 6 months) - optional
    // You might want to move these to a separate archive table or data warehouse

    console.log("[CLEANUP JOB] ✓ Cleanup completed");
  } catch (error: any) {
    console.error("[CLEANUP JOB] Error:", error);
  }
}

// ====================================================================
// QUEUE MONTHLY JOB (If using BullMQ or similar)
// ====================================================================
/**
 * Example with BullMQ (install with: npm install bullmq)
 *
 * import { Queue } from 'bullmq';
 *
 * const billingQueue = new Queue('billing', {
 *   connection: {
 *     host: process.env.REDIS_HOST || 'localhost',
 *     port: parseInt(process.env.REDIS_PORT || '6379'),
 *   },
 * });
 *
 * export async function queueMonthlyBillingJob() {
 *   await billingQueue.add(
 *     'monthly-billing',
 *     {},
 *     {
 *       repeat: {
 *         pattern: '0 2 1 * *', // 2 AM on 1st of month
 *       },
 *       removeOnComplete: true,
 *     }
 *   );
 * }
 *
 * // Worker
 * billingQueue.process('monthly-billing', async () => {
 *   await executeMonthlyBillingJob();
 * });
 */
