import { Request, Response } from "express";
import { EmployeeService } from "../../services/employee/crudEmployees.service.js";
import { CreateEmployeeDto , CreateManagerDto } from "../../types/employee.types.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sendValidationError(
  res: Response,
  message: string,
  statusCode: number = 400,
): void {
  res.status(statusCode).json({ message });
}

export class EmployeeController {
  
  static async create(req: Request, res: Response): Promise<void> {
  try {
    const {
      employeeCode,
      firstName,
      lastName,
      email,
      departmentId,
      designation,
      phone,
      managerId,
      employmentStatus,
      joiningDate,
    } = req.body;

    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      sendValidationError(res, "Unauthorized", 401);
      return;
    }

    if (!isNonEmptyString(employeeCode)) {
      sendValidationError(res, "employeeCode is required");
      return;
    }

    if (!isNonEmptyString(firstName)) {
      sendValidationError(res, "firstName is required");
      return;
    }

    if (!isNonEmptyString(lastName)) {
      sendValidationError(res, "lastName is required");
      return;
    }

    if (!isNonEmptyString(email)) {
      sendValidationError(res, "email is required");
      return;
    }

    if (
      departmentId !== undefined &&
      departmentId !== null &&
      !isNonEmptyString(departmentId)
    ) {
      sendValidationError(res, "departmentId must be a string");
      return;
    }

    if (
      managerId !== undefined &&
      managerId !== null &&
      !isNonEmptyString(managerId)
    ) {
      sendValidationError(res, "managerId must be a string");
      return;
    }

    if (!isNonEmptyString(designation)) {
      sendValidationError(res, "designation is required");
      return;
    }

    if (
      employmentStatus !== undefined &&
      employmentStatus !== "active" &&
      employmentStatus !== "inactive"
    ) {
      sendValidationError(
        res,
        "employmentStatus must be active or inactive",
      );
      return;
    }

    const employeeData: CreateEmployeeDto = {
      employeeCode,
      firstName,
      lastName,
      email,
      departmentId,
      managerId,
      designation,
      phone: phone || undefined,
      employmentStatus,
      joiningDate,
    };

    const result = await EmployeeService.create(
      companyId,
      userId,
      employeeData,
    );

    res.status(201).json({
      message: "Employee created successfully",
      data: result,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "EMAIL_EXISTS"
    ) {
      res.status(409).json({
        message: "Email already in use",
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message === "DEPARTMENT_NOT_FOUND"
    ) {
      res.status(404).json({
        message: "Department not found",
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message === "MANAGER_NOT_FOUND"
    ) {
      res.status(404).json({
        message: "Manager not found",
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message === "EMPLOYEE_CODE_EXISTS"
    ) {
      res.status(409).json({
        message: "Employee code already exists",
      });
      return;
    }

    console.error("Create employee failed:", error);

    res.status(500).json({
      message: "Failed to create employee",
    });
  }
}

static async getAll(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      res.status(401).json({
        message: "Unauthorized",
      });
      return;
    }

    const employees = await EmployeeService.getAll(companyId);

    res.status(200).json({
      message: "Employees retrieved successfully",
      data: employees,
    });
  } catch (error) {
    console.error("Get employees failed:", error);

    res.status(500).json({
      message: "Failed to retrieve employees",
    });
  }
}

static async getById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const companyId = req.user?.companyId;
    const employeeId = req.params.id;

    if (!companyId) {
      res.status(401).json({
        message: "Unauthorized",
      });
      return;
    }

    if (!isNonEmptyString(employeeId)) {
      res.status(400).json({
        message: "Employee ID is required",
      });
      return;
    }

    const employee = await EmployeeService.getById(
      companyId,
      employeeId
    );

    res.status(200).json({
      message: "Employee retrieved successfully",
      data: employee,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "EMPLOYEE_NOT_FOUND"
    ) {
      res.status(404).json({
        message: "Employee not found",
      });
      return;
    }

    console.error("Get employee by ID failed:", error);

    res.status(500).json({
      message: "Failed to retrieve employee",
    });
  }
}

static async update(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const employeeId = req.params.id;
    const companyId = req.user?.companyId;

    const {
      firstName,
      lastName,
      departmentId,
      designation,
      phone,
      managerId,
      employmentStatus,
      joiningDate,
    } = req.body;

    if (!companyId) {
      sendValidationError(res, "Unauthorized", 401);
      return;
    }

    if (!isNonEmptyString(employeeId)) {
      sendValidationError(res, "Employee ID is required");
      return;
    }

    const updateData: Partial<CreateEmployeeDto> = {};

    if (firstName !== undefined) {
      if (!isNonEmptyString(firstName)) {
        sendValidationError(
          res,
          "firstName must be a non-empty string",
        );
        return;
      }

      updateData.firstName = firstName;
    }

    if (lastName !== undefined) {
      if (!isNonEmptyString(lastName)) {
        sendValidationError(
          res,
          "lastName must be a non-empty string",
        );
        return;
      }

      updateData.lastName = lastName;
    }

    if (departmentId !== undefined) {
      if (!isNonEmptyString(departmentId)) {
        sendValidationError(
          res,
          "departmentId must be a non-empty string",
        );
        return;
      }

      updateData.departmentId = departmentId;
    }

    if (managerId !== undefined) {
      if (!isNonEmptyString(managerId)) {
        sendValidationError(
          res,
          "managerId must be a non-empty string",
        );
        return;
      }

      updateData.managerId = managerId;
    }

    if (designation !== undefined) {
      if (!isNonEmptyString(designation)) {
        sendValidationError(
          res,
          "designation must be a non-empty string",
        );
        return;
      }

      updateData.designation = designation;
    }

    if (phone !== undefined) {
      if (phone !== null && !isNonEmptyString(phone)) {
        sendValidationError(
          res,
          "phone must be a non-empty string",
        );
        return;
      }

      updateData.phone = phone;
    }

    if (employmentStatus !== undefined) {
      if (
        employmentStatus !== "active" &&
        employmentStatus !== "inactive"
      ) {
        sendValidationError(
          res,
          "employmentStatus must be active or inactive",
        );
        return;
      }

      updateData.employmentStatus = employmentStatus;
    }

    if (joiningDate !== undefined) {
      updateData.joiningDate = joiningDate;
    }

    if (Object.keys(updateData).length === 0) {
      sendValidationError(
        res,
        "At least one field must be provided for update",
      );
      return;
    }

    const employee = await EmployeeService.update(
      companyId,
      employeeId,
      updateData,
    );

    res.status(200).json({
      message: "Employee updated successfully",
      data: employee,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "EMPLOYEE_NOT_FOUND"
    ) {
      res.status(404).json({
        message: "Employee not found",
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message === "DEPARTMENT_NOT_FOUND"
    ) {
      res.status(404).json({
        message: "Department not found",
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message === "MANAGER_NOT_FOUND"
    ) {
      res.status(404).json({
        message: "Manager not found",
      });
      return;
    }

    console.error("Update employee failed:", error);

    res.status(500).json({
      message: "Failed to update employee",
    });
  }
}

static async delete(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const companyId = req.user?.companyId;
    const employeeId = req.params.id;

    if (!companyId) {
      res.status(401).json({
        message: "Unauthorized",
      });
      return;
    }

    if (!isNonEmptyString(employeeId)) {
      res.status(400).json({
        message: "Employee ID is required",
      });
      return;
    }

    await EmployeeService.delete(
      companyId,
      employeeId,
    );

    res.status(200).json({
      message: "Employee deleted successfully",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "EMPLOYEE_NOT_FOUND"
    ) {
      res.status(404).json({
        message: "Employee not found",
      });
      return;
    }

    console.error("Delete employee failed:", error);

    res.status(500).json({
      message: "Failed to delete employee",
    });
  }
}

static async createManager(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const {
      employeeCode,
      firstName,
      lastName,
      email,
      departmentId,
      designation,
      phone,
      employmentStatus,
      joiningDate,
    } = req.body;

    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      sendValidationError(res, "Unauthorized", 401);
      return;
    }

    if (!isNonEmptyString(employeeCode)) {
      sendValidationError(
        res,
        "employeeCode is required",
      );
      return;
    }

    if (!isNonEmptyString(firstName)) {
      sendValidationError(
        res,
        "firstName is required",
      );
      return;
    }

    if (!isNonEmptyString(lastName)) {
      sendValidationError(
        res,
        "lastName is required",
      );
      return;
    }

    if (!isNonEmptyString(email)) {
      sendValidationError(
        res,
        "email is required",
      );
      return;
    }

    if (
      departmentId !== undefined &&
      departmentId !== null &&
      !isNonEmptyString(departmentId)
    ) {
      sendValidationError(
        res,
        "departmentId must be a string",
      );
      return;
    }

    if (!isNonEmptyString(designation)) {
      sendValidationError(
        res,
        "designation is required",
      );
      return;
    }

    if (
      employmentStatus !== undefined &&
      employmentStatus !== "active" &&
      employmentStatus !== "inactive"
    ) {
      sendValidationError(
        res,
        "employmentStatus must be active or inactive",
      );
      return;
    }

    const managerData: CreateManagerDto = {
      employeeCode,
      firstName,
      lastName,
      email,
      departmentId,
      designation,
      phone,
      employmentStatus,
      joiningDate,
    };

    const result =
      await EmployeeService.createManager(
        companyId,
        userId,
        managerData,
      );

    res.status(201).json({
      message: "Manager created successfully",
      data: result,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "EMAIL_EXISTS"
    ) {
      res.status(409).json({
        message: "Email already exists",
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message === "DEPARTMENT_NOT_FOUND"
    ) {
      res.status(404).json({
        message: "Department not found",
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message === "EMPLOYEE_CODE_EXISTS"
    ) {
      res.status(409).json({
        message: "Employee code already exists",
      });
      return;
    }

    console.error(
      "Create manager failed:",
      error,
    );

    res.status(500).json({
      message: "Failed to create manager",
    });
  }
}



}
