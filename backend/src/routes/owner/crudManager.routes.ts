import { Router } from "express";
import { EmployeeController } from "../../controllers/manager/crudEmployees.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { requireCompany } from "../../middleware/company.middleware.js";

const router = Router();

// // Apply authentication, company check, and authorization middleware to all routes
// router.use(authenticate);
// router.use(requireCompany);
// router.use(authorize("owner"));

// Create employee
router.post("/", EmployeeController.createManager);

// // Get all employees
// router.get("/", EmployeeController.getAll);

// // Get employee by ID
// router.get("/:id", EmployeeController.getById);

// // Update employee
// router.patch("/:id", EmployeeController.update);

// // Delete employee
// router.delete("/:id", EmployeeController.delete);

export default router;
