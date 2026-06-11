import { Router } from "express";
import { RetrievalAnalyticsController } from "../../controllers/manager/crudRetrievalAnalytics.controller.js";
const router = Router();
router.get("/", RetrievalAnalyticsController.getNoAnswerLogs);
export default router;
