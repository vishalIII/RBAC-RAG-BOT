import { Request, Response } from "express";
import axios from "axios";

import {
  createSession,
  saveMessage,
  getRecentMessages, createNoAnswerLog
} from "../services/chatService.js";

import {
  buildSessionTitle,
  formatConversationHistory,
  extractSseData,
  normalizeSessionId
} from "../utils/chatHelpers.js";

type ChatRequestBody = {
  question: string;
  department_id?: string;
  sessionId?: string;
  session_id?: string;
};

export const chat = async (
  req: Request<{}, {}, ChatRequestBody>,
  res: Response,
) => {
  try {
    const { question, sessionId: requestedSessionId, session_id } = req.body;

    const companyId = req.user?.companyId;
    const employeeId = req.employee?.id;
    const departmentId = req.employee?.department_id;

    console.log(
      `[${question}] | company=${companyId} | employee=${employeeId}`,
    );

    if (!question?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Question is required",
      });
    }

    if (!companyId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    if (!employeeId) {
      return res.status(401).json({
        success: false,
        error: "Employee not found",
      });
    }

    const existingSessionId =
      normalizeSessionId(requestedSessionId) || normalizeSessionId(session_id);

    const sessionId =
      existingSessionId ||
      (await createSession({
        companyId,
        employeeId,
        title: buildSessionTitle(question),
      }));

    const recentMessages = existingSessionId
      ? await getRecentMessages(sessionId)
      : [];

    const conversationHistory = formatConversationHistory(recentMessages);

    await saveMessage({
      sessionId,
      role: "user",
      content: question.trim(),
    });

    res.setHeader("X-Session-Id", sessionId);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders?.();

    const response = await axios({
      method: "post",
      url: "http://127.0.0.1:8000/chat",
      data: {
        question,
        company_id: companyId,
        department_id: departmentId,
        conversation_history: conversationHistory,
      },
      responseType: "stream",
    });

    let assistantStream = "";
    let noAnswerReason: string | null = null;
    response.data.on("data", (chunk: Buffer) => {
      const text = chunk.toString();

      assistantStream += text;

      const eventMatch = /event:\s*no_answer\s*[\r\n]+data:\s*(.+)/.exec(text);

      if (eventMatch) {
        try {
          const payload = JSON.parse(eventMatch[1]);
          noAnswerReason = payload.reason;
        } catch {}
      }

      res.write(chunk);
    });

    response.data.on("end", async () => {
      try {
        const assistantMessage = extractSseData(assistantStream).trim();

        if (assistantMessage) {
          await saveMessage({
            sessionId,
            role: "assistant",
            content: assistantMessage,
          });
        }

        if (noAnswerReason) {
          await createNoAnswerLog({
            companyId,
            employeeId,
            question,
            reason: noAnswerReason,
          });
        }
      } catch (error: any) {
        console.error("Could not save assistant message:", error.message);
      }

      res.end();
    });

    response.data.on("error", (err: Error) => {
      console.error("Stream error:", err);
      res.end();
    });
  } catch (error: any) {
    console.error(error);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Something went wrong",
      });
    }
  }
};
