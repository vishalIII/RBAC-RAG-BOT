export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        companyId: string | null;
        role: string;
        email: string;
        userType: "platform_admin" | "company_user";
      };
    }
  }
}
