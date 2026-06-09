import { Router } from "express";
import { DashboardController } from "../../controllers/manager/dashboard.controller.js";

const router = Router();

/**
 * @route GET /api/v1/manager/dashboard/stats
 */
router.get("/stats", DashboardController.getStats);

export default router;