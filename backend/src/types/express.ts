export {};

declare global {
  namespace Express {
    interface User {
      id: string;
      companyId: string | null;
      role: string;
      email: string;
      userType: "platform_admin" | "company_user";
    }

    interface Request {
      user?: User;
      employee?: {
        id: string;
        company_id: string;
        user_id: string;
        manager_id: string | null;
        employee_code: string;
        first_name: string;
        last_name: string;
        [key: string]: any;
      };
    }
  }
}
