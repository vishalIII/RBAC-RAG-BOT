import { DashboardService } from "../../services/manager/dashboard.service.js";
export class DashboardController {
    /**
     * GET /api/v1/admin/dashboard/stats
     */
    static async getStats(req, res) {
        try {
            const companyId = req.user?.companyId;
            if (!companyId) {
                return res.status(401).json({ error: "Unauthorized: No company context found" });
            }
            const stats = await DashboardService.getCompanyStats(companyId);
            return res.status(200).json(stats);
        }
        catch (error) {
            console.error("Dashboard Stats Error:", error);
            return res.status(500).json({ error: "Failed to fetch dashboard statistics" });
        }
    }
}
