import { Router } from "express";
import { chat } from "../controllers/chatController.js";
import { submitFeedback } from "../controllers/feedbackController.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", chat);
router.post("/feedback", authenticate, submitFeedback);

export default router;
