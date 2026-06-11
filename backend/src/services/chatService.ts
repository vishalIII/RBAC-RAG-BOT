import pool from "../config/db.js";

type CreateSessionParams = {
  companyId: string;
  employeeId: string;
  title?: string;
};

type SaveMessageParams = {
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type ChatMessage = {
  role: string;
  content: string;
};

export async function createSession({
  companyId,
  employeeId,
  title = "New Chat",
}: CreateSessionParams): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
    INSERT INTO chat_sessions (
      company_id,
      employee_id,
      title
    )
    VALUES ($1, $2, $3)
    RETURNING id
    `,
    [companyId, employeeId, title]
  );

  return result.rows[0].id;
}

export async function saveMessage({
  sessionId,
  role,
  content,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
}: SaveMessageParams): Promise<void> {
  await pool.query(
    `
    INSERT INTO chat_messages (
      session_id,
      role,
      content,
      prompt_tokens,
      completion_tokens,
      total_tokens
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      sessionId,
      role,
      content,
      promptTokens,
      completionTokens,
      totalTokens,
    ]
  );
}

export async function getRecentMessages(
  sessionId: string,
  limit: number = 6
): Promise<ChatMessage[]> {
  const result = await pool.query<ChatMessage>(
    `
    SELECT role, content
    FROM chat_messages
    WHERE session_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [sessionId, limit]
  );

  return result.rows.reverse();
}




type CreateNoAnswerLogParams = {
  companyId: string;
  employeeId: string;
  question: string;
  reason: string;
};

export const createNoAnswerLog = async ({
  companyId,
  employeeId,
  question,
  reason,
}: CreateNoAnswerLogParams) => {
  await pool.query(
    `
    INSERT INTO no_answer_logs (
      company_id,
      employee_id,
      question,
      reason
    )
    VALUES ($1, $2, $3, $4)
    `,
    [companyId, employeeId, question, reason]
  );
};