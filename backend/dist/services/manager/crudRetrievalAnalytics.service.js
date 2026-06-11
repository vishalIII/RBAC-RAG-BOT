import pool from "../../config/db.js";
export class RetrievalAnalytics {
    static async getNoAnswerLogs(companyId) {
        const result = await pool.query("SELECT * FROM no_answer_logs WHERE company_id=$1 ORDER BY created_at DESC LIMIT 20", [companyId]);
        return result.rows;
    }
}
