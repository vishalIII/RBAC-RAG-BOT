import { Request, Response, NextFunction } from "express";

export const requireTenant = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  if (
    req.user.userType === "company_user" &&
    !req.user.tenantId
  ) {
    res.status(403).json({
      message: "Tenant not assigned",
    });
    return;
  }

  next();
};
