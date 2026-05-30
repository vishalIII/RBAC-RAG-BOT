export interface RegisterDto {
  company_name: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
  user_type: "platform_admin" | "company_user";
  tenant_id?: string;
}

export interface RefreshDto {
  refresh_token: string;
}