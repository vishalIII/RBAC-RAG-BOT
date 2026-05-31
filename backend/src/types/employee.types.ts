export interface CreateEmployeeDto {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  designation: string;
  phone?: string;
}