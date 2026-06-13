import { Request, Response } from "express";
import axios from "axios";
import { createParser, EventSourceMessage } from "eventsource-parser";

import {
  createSession,
  saveMessage,
  getRecentMessages,
  createNoAnswerLog,
} from "../services/chatService.js";

import {
  buildSessionTitle,
  formatConversationHistory,
  extractSseData,
  normalizeSessionId,
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

    const userMessage = await saveMessage({
      sessionId,
      role: "user",
      content: question.trim(),
    });
    const questionMessageId = userMessage.id;

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
    // Must match NO_CONTEXT_RESPONSE in chat.py exactly
    const NO_CONTEXT_RESPONSE = "I could not find the answer in the documents.";
    let noAnswerReason: string | null = null;
        const parser = createParser({
      onEvent(event: EventSourceMessage) {
        // Only try to parse JSON if it's an event we expect to be JSON
        try {
          if (event.event === "no_answer") {
            const payload = JSON.parse(event.data);
            noAnswerReason = payload.reason;
            console.log("Found noAnswerReason (event):", noAnswerReason);
          } else if (event.event === "metadata") {
            const payload = JSON.parse(event.data);
            if (payload.type === "no_answer") {
              noAnswerReason = payload.reason;
              console.log("Found noAnswerReason (metadata):", noAnswerReason);
            }
          }
        } catch (err) {
          // Ignore parsing errors for regular text tokens
        }
      },
    });

    response.data.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      assistantStream += text;
      console.log("Streaming chunk received..."); // Minimal log to verify activity
      parser.feed(text);
      res.write(chunk);
    });

    response.data.on("end", async () => {
      try {
        console.log("Stream ended. Processing final message...");
        const assistantMessage = extractSseData(assistantStream).trim();

        const normalizedAssistantMessage = assistantMessage.replace(/\s+/g, ' ').trim();
        const normalizedNoContextResponse = NO_CONTEXT_RESPONSE.replace(/\s+/g, ' ').trim();

        const savedAssistantMsg = await saveMessage({
          sessionId,
          role: "assistant",
          content: assistantMessage,
        });
        const answerMessageId = savedAssistantMsg.id;

        // Fallback: If no metadata event was caught, but the content matches our "no answer" string
        // This happens when the LLM itself generates the rejection message.
        if (!noAnswerReason && normalizedAssistantMessage.includes(normalizedNoContextResponse)) { // Use normalized strings for robust comparison
          console.log("Fallback triggered: Content match for 'no answer'");
          noAnswerReason = "LLM_REJECTED_CONTEXT";
        }

        if (noAnswerReason) {
          await createNoAnswerLog({
            companyId,
            employeeId,
            question,
            reason: noAnswerReason,
          });
        }

        // Send metadata with IDs to the frontend
        res.write(
          `data: ${JSON.stringify({
            _metadata: {
              questionMessageId,
              answerMessageId,
            },
          })}\n\n`
        );
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
