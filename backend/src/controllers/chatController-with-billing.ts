import { Request, Response } from "express";
import axios from "axios";

import {
  createSession,
  saveMessage,
  getRecentMessages,
} from "../services/chatService.js";

import {
  buildSessionTitle,
  formatConversationHistory,
  extractSseData,
  normalizeSessionId,
} from "../utils/chatHelpers.js";

// ====================================================================
// NEW: Token tracking imports
// ====================================================================
import {
  recordTokenUsage,
  checkUsageLimits,
} from "../services/billing/usageTrackingService.js";
import {
  checkLimitsBeforeChat,
  extractGeminiUsageMetadata,
  addUsageSummaryHeaders,
} from "../middleware/usageTracking.middleware.js";
import { LimitExceededError } from "../types/billing.types.js";

type ChatRequestBody = {
  question: string;
  department_id?: string;
  sessionId?: string;
  session_id?: string;
};

/**
 * Main Chat Controller with Token Tracking
 *
 * Flow:
 * 1. Validate request and user
 * 2. Check usage limits before processing
 * 3. Get or create session
 * 4. Stream response from Python AI service
 * 5. Extract token usage from response
 * 6. Record token usage in database
 * 7. Update subscription usage
 * 8. Return response with usage headers
 */
export const chat = async (
  req: Request<{}, {}, ChatRequestBody>,
  res: Response
) => {
  let messageId: string | undefined;
  let sessionId: string | undefined;

  try {
    const {
      question,
      sessionId: requestedSessionId,
      session_id,
    } = req.body;

    const companyId = req.user?.companyId;
    const employeeId = req.employee?.id;
    const departmentId = req.employee?.department_id;

    console.log(
      `[${question}] | company=${companyId} | employee=${employeeId}`
    );

    // ================================================================
    // VALIDATION
    // ================================================================
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

    // ================================================================
    // NEW: CHECK USAGE LIMITS
    // ================================================================
    try {
      const limitStatus = await checkUsageLimits({
        companyId,
        promptTokens: Math.ceil(question.length / 4), // Rough estimate
        completionTokens: 500, // Conservative estimate
      });

      if (!limitStatus.isWithinLimit) {
        return res.status(429).json({
          success: false,
          error: "Usage limit exceeded for this billing period",
          details: {
            currentUsagePercent: limitStatus.currentUsagePercent,
            daysUntilReset: limitStatus.daysUntilReset,
            tokensRemaining: limitStatus.tokensRemaining,
          },
        });
      }
    } catch (error: any) {
      console.error("Error checking usage limits:", error);
      // Log but continue - limits should not block the service
    }

    // ================================================================
    // SESSION MANAGEMENT
    // ================================================================
    const existingSessionId =
      normalizeSessionId(requestedSessionId) ||
      normalizeSessionId(session_id);

    sessionId =
      existingSessionId ||
      (await createSession({
        companyId,
        employeeId,
        title: buildSessionTitle(question),
      }));

    // sessionId is required for message saving and billing.
    if (!sessionId) {
      throw new Error("Could not create or resolve sessionId");
    }


    const recentMessages = existingSessionId
      ? await getRecentMessages(sessionId)
      : [];

    const conversationHistory =
      formatConversationHistory(recentMessages);

    // NEW: Save user message. (chatService.saveMessage currently returns void)
    await saveMessage({
      sessionId: sessionId!,
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

    // ================================================================
    // STREAMING FROM AI SERVICE
    // ================================================================
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
      timeout: 120000, // 2 minute timeout for streaming
    });

    let assistantStream = "";
    let totalChunkSize = 0;

    // NEW: Track streaming to extract tokens
    response.data.on("data", (chunk: Buffer) => {
      assistantStream += chunk.toString();
      totalChunkSize += chunk.length;
      res.write(chunk);
    });

    response.data.on("end", async () => {
      try {
        // ============================================================
        // NEW: EXTRACT AND RECORD TOKEN USAGE
        // ============================================================
        const assistantMessage =
          extractSseData(assistantStream).trim();

        if (assistantMessage) {
          // Save assistant message to database
          // chatService.saveMessage currently returns void, so we cannot capture messageId.
          await saveMessage({
            sessionId: sessionId!,
            role: "assistant",
            content: assistantMessage,
          });

          messageId = undefined;

          // Extract usage metadata from streamed response
          const usage = extractGeminiUsageMetadata(assistantStream);

          let promptTokens = 0;
          let completionTokens = 0;
          let totalTokens = 0;

          if (usage && usage.totalTokenCount > 0) {
            // Use actual Gemini tokens from API response
            promptTokens = usage.promptTokenCount;
            completionTokens = usage.candidatesTokenCount;
            totalTokens = usage.totalTokenCount;
          } else {
            // Fallback: estimate tokens from response
            // This is a rough estimate; actual tokens should come from Gemini
            promptTokens = Math.ceil(question.length / 4);
            completionTokens = Math.ceil(assistantMessage.length / 4);
            totalTokens = promptTokens + completionTokens;
          }

          // Record token usage
          try {
            await recordTokenUsage({
              companyId,
              employeeId,
              sessionId,
              messageId: messageId ?? undefined,
              promptTokens,
              completionTokens,
              totalTokens,
              modelName: "gemini-2.5-flash",
              questionPreview: question.substring(0, 200),
              contextTokens: 0, // Can be extracted from Python service
            });

            // NEW: Add usage information to response headers
            // (Note: Headers can't be sent after body, but we can send them early via SSE)
            res.write(
              `data: ${JSON.stringify({
                _metadata: {
                  promptTokens,
                  completionTokens,
                  totalTokens,
                  costCents: Math.ceil(
                    (promptTokens / 1000) * 1 +
                    (completionTokens / 1000) * 4
                  ),
                },
              })}\n\n`
            );

            console.log(
              `[Token Usage] company=${companyId} | tokens=${totalTokens} | ` +
              `prompt=${promptTokens} | completion=${completionTokens}`
            );
          } catch (trackingError: any) {
            console.error(
              "Error recording token usage:",
              trackingError.message
            );
            // Don't fail the response if token tracking fails
          }
        }

        res.end();
      } catch (error: any) {
        console.error(
          "Could not save assistant message:",
          error.message
        );
        res.end();
      }
    });

    response.data.on("error", (err: Error) => {
      console.error("Stream error:", err);
      res.end();
    });
  } catch (error: any) {
    console.error(error);

    // NEW: Handle specific billing errors
    if (error instanceof LimitExceededError) {
      if (!res.headersSent) {
        return res.status(429).json({
          success: false,
          error: "Usage limit exceeded for this billing period",
          limitType: error.limitType,
          currentUsagePercent: error.currentUsagePercent,
        });
      }
    }

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: "Something went wrong",
      });
    }
  }
};

/**
 * ALTERNATIVE IMPLEMENTATION for Non-Streaming Chat
 *
 * Use this if you want a simpler implementation without streaming.
 * This version collects the entire response before returning.
 */
export const chatNonStreaming = async (
  req: Request<{}, {}, ChatRequestBody>,
  res: Response
) => {
  try {
    const {
      question,
      sessionId: requestedSessionId,
      session_id,
    } = req.body;

    const companyId = req.user?.companyId;
    const employeeId = req.employee?.id;
    const departmentId = req.employee?.department_id;

    // Validation
    if (!question?.trim() || !companyId || !employeeId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    // Check limits
    const limitStatus = await checkUsageLimits({
      companyId,
      promptTokens: Math.ceil(question.length / 4),
      completionTokens: 500,
    });

    if (!limitStatus.isWithinLimit) {
      return res.status(429).json({
        success: false,
        error: "Usage limit exceeded",
        currentUsagePercent: limitStatus.currentUsagePercent,
      });
    }

    // Session management
    const existingSessionId =
      normalizeSessionId(requestedSessionId) ||
      normalizeSessionId(session_id);

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

    const conversationHistory =
      formatConversationHistory(recentMessages);

    // Get response from AI service
    const response = await axios.post(
      "http://127.0.0.1:8000/chat",
      {
        question,
        company_id: companyId,
        department_id: departmentId,
        conversation_history: conversationHistory,
      },
      { timeout: 60000 }
    );

    // Extract message and tokens
    const assistantMessage = response.data?.message || "";
    const usage = response.data?.usage || {
      promptTokens: 0,
      completionTokens: 0,
    };

    // Save messages
    await saveMessage({
      sessionId: sessionId!,
      role: "user",
      content: question.trim(),
    });

    // chatService.saveMessage currently returns void, so we cannot capture messageId.
    await saveMessage({
      sessionId,
      role: "assistant",
      content: assistantMessage,
    });

    // Record token usage
    await recordTokenUsage({
      companyId,
      employeeId,
      sessionId,
      messageId: undefined,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.promptTokens + usage.completionTokens,
      modelName: "gemini-2.5-flash",
      questionPreview: question.substring(0, 200),
    });

    // Return response with usage
    res.json({
      success: true,
      sessionId,
      message: assistantMessage,
      usage: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.promptTokens + usage.completionTokens,
        costCents: Math.ceil(
          (usage.promptTokens / 1000) * 1 +
          (usage.completionTokens / 1000) * 4
        ),
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message || "Something went wrong",
    });
  }
};
