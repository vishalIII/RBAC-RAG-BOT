import pool from "../../config/db.js";
export class DashboardService {
    /**
     * Fetches all Phase 1 MVP dashboard metrics for a specific company
     * using a single optimized CTE query.
     */
    static async getCompanyStats(companyId) {
        const query = `
      WITH dashboard_stats AS (
        SELECT
            -- 1. Questions Asked
            (SELECT COUNT(*) 
             FROM chat_messages m 
             JOIN chat_sessions s ON m.session_id = s.id 
             WHERE s.company_id = $1 
               AND m.role = 'user') as "questionsAsked",

            -- 2. Active Users (Last 30 days)
            (SELECT COUNT(DISTINCT s.employee_id) 
             FROM chat_messages m 
             JOIN chat_sessions s ON m.session_id = s.id 
             WHERE s.company_id = $1 
               AND m.created_at >= NOW() - INTERVAL '30 days') as "activeUsers",        

            -- 3. Documents Uploaded
            (SELECT COUNT(*) 
             FROM documents 
             WHERE company_id = $1) as "documentsUploaded",                             

            -- 4. Storage Used (Converted to MB)
            (SELECT COALESCE(SUM(file_size), 0) / (1024.0 * 1024.0) 
             FROM documents 
             WHERE company_id = $1) as "storageUsedMB",

            -- 5. Input Tokens
            (SELECT COALESCE(SUM(prompt_tokens), 0) 
             FROM token_usage_logs 
             WHERE company_id = $1) as "inputTokens",

            -- 6. Output Tokens
            (SELECT COALESCE(SUM(completion_tokens), 0) 
             FROM token_usage_logs 
             WHERE company_id = $1) as "outputTokens",

            -- 7. Estimated Cost (From cents to dollars)
            (SELECT COALESCE(SUM(total_cost_cents), 0) / 100.0 
             FROM token_usage_logs 
             WHERE company_id = $1) as "estimatedCost",

            -- 8. Average Response Time
            (SELECT COALESCE(AVG(response_time_ms), 0) 
             FROM rag_request_logs 
             WHERE company_id = $1) as "avgResponseTimeMs"
      )
      SELECT json_build_object(
          'questionsAsked', "questionsAsked",
          'activeUsers', "activeUsers",
          'documentsUploaded', "documentsUploaded",
          'storageUsedMB', ROUND("storageUsedMB"::numeric, 2),
          'inputTokens', "inputTokens",
          'outputTokens', "outputTokens",
          'estimatedCost', ROUND("estimatedCost"::numeric, 2),
          'avgResponseTimeMs', ROUND("avgResponseTimeMs"::numeric, 0)
      ) AS stats FROM dashboard_stats;
    `;
        const result = await pool.query(query, [companyId]);
        return result.rows[0].stats;
    }
}
