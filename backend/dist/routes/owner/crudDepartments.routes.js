import { Router } from "express";
import { DepartmentController } from "../../controllers/owner/crudDepartments.controller.js";
const router = Router();
// Create employee
router.post("/", DepartmentController.create);
// router.get("/", (_, res) => {
//   res.send("this department home");
// });
// // Get all employees
router.get("/", DepartmentController.getAll);
// // Get employee by ID
// router.get("/:id", EmployeeController.getById);
// // Update employee
// router.patch("/:id", EmployeeController.update);
// // Delete employee
// router.delete("/:id", EmployeeController.delete);
export default router;
