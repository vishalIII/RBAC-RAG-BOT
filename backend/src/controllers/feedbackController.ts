import { Request, Response } from "express";
import pool from "../config/db.js";

export const submitFeedback = async (req: Request, res: Response) => {
  try {
    const { 
      questionMessageId, 
      answerMessageId, 
      rating, 
      comment 
    } = req.body;

    const companyId = req.user?.companyId;
    const employeeId = req.employee?.id;

    if (!questionMessageId || !answerMessageId || !rating) {
      return res.status(400).json({ error: "Missing required feedback fields" });
    }

    // rating must be 1 or -1 per SQL constraint
    if (![1, -1].includes(rating)) {
      return res.status(400).json({ error: "Invalid rating. Use 1 for up, -1 for down." });
    }

    await pool.query(
      `INSERT INTO message_feedback (
        company_id, employee_id, question_message_id, answer_message_id, rating, comment
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [companyId, employeeId, questionMessageId, answerMessageId, rating, comment]
    );

    res.json({ success: true, message: "Feedback recorded" });
  } catch (error: any) {
    console.error("Feedback error:", error);
    res.status(500).json({ error: "Failed to save feedback" });
  }
};