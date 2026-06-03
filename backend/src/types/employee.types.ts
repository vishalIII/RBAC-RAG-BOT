export interface CreateEmployeeDto {
  email: string;

  employeeCode: string;

  firstName: string;
  lastName: string;

  designation: string;

  departmentId?: string;

  managerId?: string;

  phone?: string;

  employmentStatus?: "active" | "inactive";

  joiningDate?: string;
}


export interface CreateManagerDto {
  employeeCode: string;

  firstName: string;
  lastName: string;

  email: string;

  departmentId?: string;

  designation: string;

  phone?: string;

  employmentStatus?: "active" | "inactive";

  joiningDate?: string; // YYYY-MM-DD
}