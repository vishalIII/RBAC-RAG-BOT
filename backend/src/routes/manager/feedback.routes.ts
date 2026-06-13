import { Router } from "express";
import {getFeedbackStats} from "../../controllers/feedback/feedbackController.js"
const router = Router();

/**
 * @route GET /api/v1/manager/dashboard/stats
 */
router.get("/stats", getFeedbackStats);

export default router;