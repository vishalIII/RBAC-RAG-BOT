import express from "express";
import employeeRoutes from "./crudEmployees.routes.js";
import crudDocumentsRoutes from "./crudDocuments.routes.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { requireTenant } from "../../middleware/tenant.middleware.js";

const app = express.Router();

app.use("/employee", authenticate, requireTenant, authorize("manager"), employeeRoutes);
app.use("/document", authenticate, requireTenant, authorize("manager"), crudDocumentsRoutes);

export default app;