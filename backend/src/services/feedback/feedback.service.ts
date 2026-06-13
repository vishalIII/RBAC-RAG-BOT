import pool from "../../config/db.js";

export class FeedbackService {
  static async submitFeedback(data: {
    companyId: string;
    employeeId: string;
    questionMessageId: string;
    answerMessageId: string;
    rating: number;
    comment?: string;
  }) {
    const {
      companyId,
      employeeId,
      questionMessageId,
      answerMessageId,
      rating,
      comment,
    } = data;

    await pool.query(
      `
      INSERT INTO message_feedback (
        company_id,
        employee_id,
        question_message_id,
        answer_message_id,
        rating,
        comment
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        companyId,
        employeeId,
        questionMessageId,
        answerMessageId,
        rating,
        comment,
      ]
    );

    return {
      success: true,
      message: "Feedback recorded",
    };
  }

  static async getFeedbackStats(companyId: string) {
    const result = await pool.query(
      `
      SELECT
        COUNT(*) AS total_feedback,
        COUNT(*) FILTER (WHERE rating = 1) AS positive_feedback,
        COUNT(*) FILTER (WHERE rating = -1) AS negative_feedback
      FROM message_feedback
      WHERE company_id = $1
      `,
      [companyId]
    );

    const stats = result.rows[0];

    return {
      totalFeedback: Number(stats.total_feedback),
      positiveFeedback: Number(stats.positive_feedback),
      negativeFeedback: Number(stats.negative_feedback),
    };
  }
}