import pool from "../config/db.js";
import { v4 as uuidv4 } from "uuid";

type SaveMessageParams = {
  sessionId: string;
  role: string;
  content: string;
};

type ChatMessage = {
  role: string;
  content: string;
};

export async function createSession(
  title: string = "New Chat"
): Promise<string> {
  const sessionId = uuidv4();

  await pool.query(
    `
    INSERT INTO chat_sessions (
      id,
      title
    )
    VALUES ($1, $2)
    `,
    [sessionId, title]
  );

  console.log(sessionId);

  return sessionId;
}

export async function saveMessage({
  sessionId,
  role,
  content,
}: SaveMessageParams): Promise<void> {
  const messageId = uuidv4();

  await pool.query(
    `
    INSERT INTO chat_messages (
      id,
      session_id,
      role,
      content
    )
    VALUES ($1, $2, $3, $4)
    `,
    [messageId, sessionId, role, content]
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