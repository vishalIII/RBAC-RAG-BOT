import { DepartmentService } from "../../services/owner/crudDepartments.service.js";
import { sendError, sendSuccess } from "../../utils/response.js";
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
// ================================================================================
export class DepartmentController {
    static async create(req, res) {
        try {
            const { name, description } = req.body;
            const companyId = req.user?.companyId;
            if (!companyId) {
                sendError(res, "Unauthorized", 401);
                return;
            }
            if (!isNonEmptyString(name)) {
                sendError(res, "name is required");
                return;
            }
            const departmentData = {
                name,
                description,
            };
            const result = await DepartmentService.create(companyId, departmentData);
            res.status(201).json({
                message: "Department created successfully",
                data: result,
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === "DEPARTMENT_EXISTS") {
                res.status(409).json({
                    message: "Department already exists",
                });
                return;
            }
            console.error("Create department failed:", error);
            res.status(500).json({
                message: "Failed to create department",
            });
        }
    }
    //   ================================================================= GET ALL =====
    static async getAll(req, res) {
        try {
            const companyId = req.user?.companyId;
            if (!companyId) {
                sendError(res, "Unauthorized", 401);
                return;
            }
            const departments = await DepartmentService.getAll(companyId);
            sendSuccess(res, "Departments retrieved successfully", departments, 200);
        }
        catch (error) {
            console.error("Get department failed:", error);
            sendError(res, "Failed to retrieve departments", 500);
        }
    }
}
