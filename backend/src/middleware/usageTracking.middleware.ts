import { Request, Response, NextFunction } from "express";
import { recordTokenUsage, checkUsageLimits } from "../services/billing/usageTrackingService.js";
import { GeminiUsageMetadata } from "../types/billing.types.js";

// ====================================================================
// Extend Express Request type to include billing context
// ====================================================================
declare global {
  namespace Express {
    interface Request {
      billingContext?: {
        companyId: string;
        employeeId: string;
        sessionId: string;
        messageId?: string;
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        modelName: string;
      };
    }
  }
}

// ====================================================================
// EXTRACT GEMINI USAGE FROM RESPONSE
// ====================================================================
export function extractGeminiUsageMetadata(
  responseText: string
): GeminiUsageMetadata | null {
  try {
    // LangChain wraps Gemini responses in SSE format
    // Look for usage metadata in the SSE stream
    const lines = responseText.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.substring(6);
        try {
          const data = JSON.parse(jsonStr);

          // LangChain includes usage in response metadata
          if (data.response_metadata?.usage_metadata) {
            const usage = data.response_metadata.usage_metadata;
            return {
              promptTokenCount: usage.prompt_token_count || 0,
              candidatesTokenCount: usage.candidates_token_count || 0,
              totalTokenCount: usage.total_token_count || 0,
            };
          }

          // Alternative format: direct usage metadata
          if (data.usage_metadata) {
            return {
              promptTokenCount: data.usage_metadata.prompt_token_count || 0,
              candidatesTokenCount: data.usage_metadata.candidates_token_count || 0,
              totalTokenCount: data.usage_metadata.total_token_count || 0,
            };
          }
        } catch {
          continue;
        }
      }
    }
  } catch (error) {
    console.error("Error extracting Gemini usage metadata:", error);
  }

  return null;
}

// ====================================================================
// MIDDLEWARE: SET UP BILLING CONTEXT
// ====================================================================
export function setupBillingContext(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const companyId = req.user?.companyId;
  const employeeId = req.employee?.id;

  if (companyId && employeeId) {
    req.billingContext = {
      companyId,
      employeeId,
      sessionId: "", // Will be set later in controller
      modelName: "gemini-2.5-flash",
    };
  }

  next();
}

// ====================================================================
// MIDDLEWARE: CHECK USAGE LIMITS BEFORE PROCESSING
// ====================================================================
export async function checkLimitsBeforeChat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      next();
      return;
    }

    const question = req.body?.question || "";
    const estimatedPromptTokens = Math.ceil(question.length / 4);

    const limitStatus = await checkUsageLimits({
      companyId,
      promptTokens: estimatedPromptTokens,
      completionTokens: 500,
    });

    if (!limitStatus.isWithinLimit) {
      res.status(429).json({
        success: false,
        error: "Usage limit exceeded for this billing period",
        details: {
          currentUsagePercent: limitStatus.currentUsagePercent,
          daysUntilReset: limitStatus.daysUntilReset,
        },
      });

      return;
    }

    req.billingContext = {
      ...req.billingContext,
      companyId,
    } as any;

    next();
  } catch (error) {
    console.error("Error checking usage limits:", error);
    next();
  }
}

// ====================================================================
// HELPER: Record token usage after streaming completes
// ====================================================================
export async function recordStreamingTokenUsage(
  companyId: string,
  employeeId: string,
  sessionId: string,
  messageId: string | undefined,
  streamedContent: string,
  modelName: string = "gemini-2.5-flash",
  questionPreview?: string
): Promise<void> {
  try {
    // Try to extract usage from the streamed content
    const usage = extractGeminiUsageMetadata(streamedContent);

    if (usage && usage.totalTokenCount > 0) {
      // Use actual Gemini tokens
      const promptTokens = Number(usage.promptTokenCount) || 0;
      const completionTokens = Number(usage.candidatesTokenCount) || 0;
      const totalTokens = Number(usage.totalTokenCount) || 0;

      await recordTokenUsage({
        companyId,
        employeeId,
        sessionId,
        messageId,
        promptTokens,
        completionTokens,
        totalTokens,
        modelName,
        questionPreview: questionPreview?.substring(0, 200),
      });
    } else {
      // Fallback: estimate tokens from response
      const estimatedCompletionTokens = Math.ceil(streamedContent.length / 4);

      await recordTokenUsage({
        companyId,
        employeeId,
        sessionId,
        messageId,
        promptTokens: 0, // Will be captured in actual implementation
        completionTokens: estimatedCompletionTokens,
        totalTokens: estimatedCompletionTokens,
        modelName,
        questionPreview: questionPreview?.substring(0, 200),
      });
    }
  } catch (error: any) {
    // Log error but don't fail the chat operation
    console.error("Error recording token usage:", error);
  }
}

// ====================================================================
// EXTRACT TOKENS FROM LANGCHAIN RESPONSE
// ====================================================================
export function extractTokensFromLangChainResponse(response: any): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} | null {
  try {
    // LangChain stores metadata in response.response_metadata
    if (response?.response_metadata?.usage_metadata) {
      const usage = response.response_metadata.usage_metadata;
      return {
        promptTokens: usage.prompt_token_count || 0,
        completionTokens: usage.candidates_token_count || 0,
        totalTokens: usage.total_token_count || 0,
      };
    }

    // Alternative: check for usage in AIMessage content
    if (response?.usage_metadata) {
      return {
        promptTokens: response.usage_metadata.prompt_token_count || 0,
        completionTokens: response.usage_metadata.candidates_token_count || 0,
        totalTokens: response.usage_metadata.total_token_count || 0,
      };
    }
  } catch (error) {
    console.error("Error extracting tokens from LangChain response:", error);
  }

  return null;
}

// ====================================================================
// USAGE SUMMARY HEADER
// ====================================================================
export function addUsageSummaryHeaders(
  res: Response,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  costCents: number
): void {
  res.setHeader("X-Prompt-Tokens", promptTokens.toString());
  res.setHeader("X-Completion-Tokens", completionTokens.toString());
  res.setHeader("X-Total-Tokens", totalTokens.toString());
  res.setHeader("X-Cost-Cents", costCents.toString());
}
