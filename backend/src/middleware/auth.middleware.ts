import { Request, Response, NextFunction } from "express";
import "../types/express.js";
import { verifyAccessToken } from "../utils/jwt.js";

interface JwtPayload {
  id?: string;
  sub?: string;
  tenantId?: string | null;
  tenant_id?: string | null;
  company_id?: string | null;
  role?: string;
  email?: string;
  userType?: "platform_admin" | "company_user";
  user_table?: "platform_users" | "company_users";
}

const resolveUserType = (
  payload: JwtPayload
): "platform_admin" | "company_user" | undefined => {               
  if (payload.userType) {
    return payload.userType;
  }

  if (payload.user_table === "platform_users") {
    return "platform_admin";
  }

  if (payload.user_table === "company_users") {
    return "company_user";
  }

  return undefined;
};

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Access token required",
      });
      return;
    }

    const token = authHeader.split(" ")[1];

    const decoded = verifyAccessToken(token) as JwtPayload;
    const id = decoded.id ?? decoded.sub;
    const userType = resolveUserType(decoded);

    if (!id || !decoded.role || !decoded.email || !userType) {
      throw new Error("Invalid token payload");
    }

    req.user = {
      id,
      tenantId: decoded.tenantId ?? decoded.tenant_id ?? null,
      companyId: decoded.company_id ?? null,
      role: decoded.role,
      email: decoded.email,
      userType,
    };

    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};
