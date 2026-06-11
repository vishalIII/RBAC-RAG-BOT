import express from "express";
import employeeRoutes from "./crudEmployees.routes.js";
import crudDocumentsRoutes from "./crudDocuments.routes.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { requireCompany } from "../../middleware/company.middleware.js";
import  DashboardStats  from "./dashboard.routes.js";
import RetrievalAnalytics  from "./crudRetrievalAnalytics.routes.js";

const app = express.Router();

app.use("/employee", authenticate, requireCompany, authorize("manager"), employeeRoutes);
app.use("/document", authenticate, requireCompany, authorize("manager"), crudDocumentsRoutes);
app.use("/dashboard", authenticate, requireCompany, authorize("manager"), DashboardStats);
app.use("/analytics",authenticate, requireCompany, authorize("manager"),RetrievalAnalytics)

export default app;
