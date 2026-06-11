import pool from "../config/db.js";
export async function createSession({ companyId, employeeId, title = "New Chat", }) {
    const result = await pool.query(`
    INSERT INTO chat_sessions (
      company_id,
      employee_id,
      title
    )
    VALUES ($1, $2, $3)
    RETURNING id
    `, [companyId, employeeId, title]);
    return result.rows[0].id;
}
export async function saveMessage({ sessionId, role, content, promptTokens = 0, completionTokens = 0, totalTokens = 0, }) {
    await pool.query(`
    INSERT INTO chat_messages (
      session_id,
      role,
      content,
      prompt_tokens,
      completion_tokens,
      total_tokens
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    `, [
        sessionId,
        role,
        content,
        promptTokens,
        completionTokens,
        totalTokens,
    ]);
}
export async function getRecentMessages(sessionId, limit = 6) {
    const result = await pool.query(`
    SELECT role, content
    FROM chat_messages
    WHERE session_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `, [sessionId, limit]);
    return result.rows.reverse();
}
export const createNoAnswerLog = async ({ companyId, employeeId, question, reason, }) => {
    await pool.query(`
    INSERT INTO no_answer_logs (
      company_id,
      employee_id,
      question,
      reason
    )
    VALUES ($1, $2, $3, $4)
    `, [companyId, employeeId, question, reason]);
};
