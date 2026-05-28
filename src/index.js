import express from "express";
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
  }),
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("This one is Home");
});

function buildSessionTitle(question) {
  const title = question.trim().replace(/\s+/g, " ");

  if (!title) {
    return "New Chat";
  }

  return title.length > 60 ? `${title.slice(0, 57)}...` : title;
}

function formatConversationHistory(messages) {
  return messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function extractSseData(streamText) {
  return streamText
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("");
}

app.post("/chat", async (req, res) => {
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

    function normalizeSessionId(id) {
      if (!id || id === "undefined" || id === "null" || id.trim() === "") {
        return null;
      }

      return id;
    }

    const existingSessionId =
      normalizeSessionId(requestedSessionId) || normalizeSessionId(session_id);

    // const existingSessionId = requestedSessionId || session_id;
    const sessionId =
      existingSessionId || (await createSession(buildSessionTitle(question)));
    console.log(sessionId);

    const recentMessages = existingSessionId
      ? await getRecentMessages(sessionId)
      : [];
    const conversationHistory = formatConversationHistory(recentMessages);

    await saveMessage({
      sessionId,
      role: "user",
      content: question.trim(),
    });

    // Forwarding Python SSE exactly to the frontend
    res.setHeader("X-Session-Id", sessionId);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // Call Python streaming API
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

    // Forward Python stream → frontend
    let assistantStream = "";

    response.data.on("data", (chunk) => {
      assistantStream += chunk.toString();
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
      } catch (error) {
        console.error("Could not save assistant message:", error.message);
      }

      res.end();
    });

    response.data.on("error", (err) => {
      console.error("Stream error:", err);
      res.end();
    });
  } catch (error) {
    console.error(error.message);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Something went wrong",
      });
    }
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
