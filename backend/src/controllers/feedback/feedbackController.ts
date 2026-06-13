import { Request, Response } from "express";
import { FeedbackService } from "../../services/feedback/feedback.service.js";

export const submitFeedback = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { questionMessageId, answerMessageId, rating, comment } = req.body;

    const companyId = req.user?.companyId;
    const employeeId = req.employee?.id;

    if (!companyId) {
      return res.status(401).json({
        error: "Company not found",
      });
    }

    if(!employeeId){
      return res.status(401).json({
        error: "Employee not found",
      });
    }

    if (!questionMessageId || !answerMessageId || !rating) {
      return res.status(400).json({
        error: "Missing required feedback fields",
      });
    }

    if (![1, -1].includes(rating)) {
      return res.status(400).json({
        error: "Invalid rating. Use 1 for up, -1 for down.",
      });
    }

    const result = await FeedbackService.submitFeedback({
      companyId,
      employeeId,
      questionMessageId,
      answerMessageId,
      rating,
      comment,
    });

    return res.json(result);
  } catch (error) {
    console.error("Feedback error:", error);

    return res.status(500).json({
      error: "Failed to save feedback",
    });
  }
};

export const getFeedbackStats = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(401).json({
        error: "Company not found",
      });
    }

    const stats = await FeedbackService.getFeedbackStats(companyId);

    return res.json(stats);
  } catch (error) {
    console.error("Get feedback stats error:", error);

    return res.status(500).json({
      error: "Failed to get feedback stats",
    });
  }
};
