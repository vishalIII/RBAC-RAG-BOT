import express from "express";
import managerRoutes from "./crudManager.routes.js";
import DepartmentRoutes from "./crudDepartments.routes.js"
// import crudDocumentsRoutes from "./crudDocuments.routes.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { requireCompany } from "../../middleware/company.middleware.js";


const app = express.Router();

app.use("/manager", authenticate, requireCompany, authorize("owner"), managerRoutes);
// app.use("/document", authenticate, requireCompany, authorize("manager"), crudDocumentsRoutes);
app.use("/department",authenticate,requireCompany,authorize("owner"), DepartmentRoutes )

export default app;
