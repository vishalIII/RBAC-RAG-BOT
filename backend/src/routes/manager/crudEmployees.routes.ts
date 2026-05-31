import { Router } from "express";
import { EmployeeController } from "../../controllers/manager/crudEmployees.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { requireTenant } from "../../middleware/tenant.middleware.js";

const router = Router();

// Apply authentication, tenant check, and authorization middleware to all routes
router.use(authenticate);
router.use(requireTenant);
router.use(authorize("admin", "manager"));

// Create employee
router.post("/", EmployeeController.create);

// Get all employees
router.get("/", EmployeeController.getAll);

// Get employee by ID
router.get("/:id", EmployeeController.getById);

// Update employee
router.patch("/:id", EmployeeController.update);

// Delete employee
router.delete("/:id", EmployeeController.delete);

export default router;