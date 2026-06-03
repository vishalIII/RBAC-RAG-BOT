import { Request, Response, NextFunction } from "express";

export const requireCompany = (
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
    !req.user.companyId
  ) {
    res.status(403).json({
      message: "Company not assigned",
    });
    return;
  }

  next();
};
