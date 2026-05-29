import express, { Request, Response } from "express";
import cors from "cors";
import axios from "axios";

import {
  createSession,
  saveMessage,
  getRecentMessages,
} from "./services/chatService.js";

const app = express();

app.use(
  cors({
    exposedHeaders: ["X-Session-Id"],
  })
);

app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.send("This one is Home");
});

function buildSessionTitle(question: string): string {
  const title = question.trim().replace(/\s+/g, " ");

  if (!title) {
    return "New Chat";
  }

  return title.length > 60
    ? `${title.slice(0, 57)}...`
    : title;
}

type ChatMessage = {
  role: string;
  content: string;
};

function formatConversationHistory(
  messages: ChatMessage[]
): string {
  return messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function extractSseData(streamText: string): string {
  return streamText
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("");
}

function normalizeSessionId(
  id?: string | null
): string | null {
  if (
    !id ||
    id === "undefined" ||
    id === "null" ||
    id.trim() === ""
  ) {
    return null;
  }

  return id;
}

type ChatRequestBody = {
  question: string;
  user_role: string;
  department?: string;
  doc_type?: string;
  sessionId?: string;
  session_id?: string;
};

app.post(
  "/chat",
  async (
    req: Request<{}, {}, ChatRequestBody>,
    res: Response
  ) => {
    try {
      const {
        question,
        user_role,
        department,
        doc_type,
        sessionId: requestedSessionId,
        session_id,
      } = req.body;

      if (!question || !question.trim()) {
        return res.status(400).json({
          success: false,
          error: "Question is required",
        });
      }

      if (!user_role) {
        return res.status(400).json({
          success: false,
          error: "User role is required",
        });
      }

      const existingSessionId =
        normalizeSessionId(requestedSessionId) ||
        normalizeSessionId(session_id);

      const sessionId =
        existingSessionId ||
        (await createSession(
          buildSessionTitle(question)
        ));

      console.log(sessionId);

      const recentMessages = existingSessionId
        ? await getRecentMessages(sessionId)
        : [];

      const conversationHistory =
        formatConversationHistory(recentMessages);

      await saveMessage({
        sessionId,
        role: "user",
        content: question.trim(),
      });

      res.setHeader("X-Session-Id", sessionId);

      res.setHeader(
        "Content-Type",
        "text/event-stream; charset=utf-8"
      );

      res.setHeader(
        "Cache-Control",
        "no-cache, no-transform"
      );

      res.setHeader("Connection", "keep-alive");

      res.flushHeaders?.();

      const response = await axios({
        method: "post",
        url: "http://127.0.0.1:8000/chat",

        data: {
          question,
          user_role,
          department,
          doc_type,
          conversation_history: conversationHistory,
        },

        responseType: "stream",
      });

      let assistantStream = "";

      response.data.on("data", (chunk: Buffer) => {
        assistantStream += chunk.toString();

        res.write(chunk);
      });

      response.data.on("end", async () => {
        try {
          const assistantMessage =
            extractSseData(assistantStream).trim();

          if (assistantMessage) {
            await saveMessage({
              sessionId,
              role: "assistant",
              content: assistantMessage,
            });
          }
        } catch (error: any) {
          console.error(
            "Could not save assistant message:",
            error.message
          );
        }

        res.end();
      });

      response.data.on("error", (err: Error) => {
        console.error("Stream error:", err);

        res.end();
      });
    } catch (error: any) {
      console.error(error.message);

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Something went wrong",
        });
      }
    }
  }
);

app.listen(5000, () => {
  console.log("Server running on port 5000");
});