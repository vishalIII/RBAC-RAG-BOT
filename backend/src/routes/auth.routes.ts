import { Router } from "express";
import { AuthController } from "../controllers/auth/auth.controller.js";

const router = Router();

router.post(
  "/register",
  AuthController.register
);

router.post(
  "/login",
  AuthController.login
);

router.post(
  "/refresh",
  AuthController.refresh
);

export default router;