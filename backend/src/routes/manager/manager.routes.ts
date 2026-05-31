import express from "express";
import employeeRoutes from "./crudEmployees.routes.js";
import crudFilesRoutes from "./crudFiles.routes.js";

const app = express.Router();

app.use("/employee", employeeRoutes);
app.use("/file", crudFilesRoutes);

export default app;