import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { requireTenant } from "../../middleware/tenant.middleware.js";

const router = Router();

// Apply authentication, tenant check, and authorization middleware to all routes
router.use(authenticate);
router.use(requireTenant);
router.use(authorize("admin", "manager"));

// File routes will be implemented here

export default router;
