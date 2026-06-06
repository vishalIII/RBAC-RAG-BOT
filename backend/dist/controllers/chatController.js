import axios from "axios";
import { createSession, saveMessage, getRecentMessages, } from "../services/chatService.js";
import { buildSessionTitle, formatConversationHistory, extractSseData, normalizeSessionId, } from "../utils/chatHelpers.js";
export const chat = async (req, res) => {
    try {
        const { question, sessionId: requestedSessionId, session_id, } = req.body;
        const companyId = req.user?.companyId;
        const employeeId = req.employee?.id;
        const departmentId = req.employee?.department_id;
        console.log(`[${question}] | company=${companyId} | employee=${employeeId}`);
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
        const existingSessionId = normalizeSessionId(requestedSessionId) ||
            normalizeSessionId(session_id);
        const sessionId = existingSessionId ||
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
            }
            catch (error) {
                console.error("Could not save assistant message:", error.message);
            }
            res.end();
        });
        response.data.on("error", (err) => {
            console.error("Stream error:", err);
            res.end();
        });
    }
    catch (error) {
        console.error(error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: "Something went wrong",
            });
        }
    }
};
