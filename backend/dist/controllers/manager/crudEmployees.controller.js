import { EmployeeService } from "../../services/manager/crudEmployees.service.js";
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function sendValidationError(res, message, statusCode = 400) {
    res.status(statusCode).json({ message });
}
export class EmployeeController {
    static async create(req, res) {
        try {
            const { employeeCode, firstName, lastName, email, department, designation, phone } = req.body;
            const companyId = req.user?.companyId;
            const userId = req.user?.id;
            if (!companyId || !userId) {
                sendValidationError(res, "Unauthorized", 401);
                return;
            }
            // Validation
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
            if (!isNonEmptyString(department)) {
                sendValidationError(res, "department is required");
                return;
            }
            if (!isNonEmptyString(designation)) {
                sendValidationError(res, "designation is required");
                return;
            }
            const employeeData = {
                employeeCode,
                firstName,
                lastName,
                email,
                department,
                designation,
                phone: phone || undefined,
            };
            const result = await EmployeeService.create(companyId, userId, employeeData);
            res.status(201).json({
                message: "Employee created successfully",
                data: result,
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === "EMAIL_EXISTS") {
                res.status(409).json({
                    message: "Email already in use",
                });
                return;
            }
            console.error("Create employee failed:", error);
            res.status(500).json({
                message: "Failed to create employee",
            });
        }
    }
    static async getAll(req, res) {
        try {
            const companyId = req.user?.companyId;
            if (!companyId) {
                sendValidationError(res, "Unauthorized", 401);
                return;
            }
            const employees = await EmployeeService.getAll(companyId);
            res.status(200).json({
                message: "Employees retrieved successfully",
                data: employees,
            });
        }
        catch (error) {
            console.error("Get employees failed:", error);
            res.status(500).json({
                message: "Failed to retrieve employees",
            });
        }
    }
    static async getById(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user?.companyId;
            if (!companyId) {
                sendValidationError(res, "Unauthorized", 401);
                return;
            }
            if (!isNonEmptyString(id)) {
                sendValidationError(res, "Employee ID is required");
                return;
            }
            const employee = await EmployeeService.getById(companyId, id);
            res.status(200).json({
                message: "Employee retrieved successfully",
                data: employee,
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
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
    static async update(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user?.companyId;
            const { firstName, lastName, department, designation, phone } = req.body;
            if (!companyId) {
                sendValidationError(res, "Unauthorized", 401);
                return;
            }
            if (!isNonEmptyString(id)) {
                sendValidationError(res, "Employee ID is required");
                return;
            }
            const updateData = {};
            if (firstName !== undefined) {
                if (firstName === null || firstName === "") {
                    sendValidationError(res, "firstName cannot be empty if provided");
                    return;
                }
                if (!isNonEmptyString(firstName)) {
                    sendValidationError(res, "firstName must be a non-empty string");
                    return;
                }
                updateData.firstName = firstName;
            }
            if (lastName !== undefined) {
                if (lastName === null || lastName === "") {
                    sendValidationError(res, "lastName cannot be empty if provided");
                    return;
                }
                if (!isNonEmptyString(lastName)) {
                    sendValidationError(res, "lastName must be a non-empty string");
                    return;
                }
                updateData.lastName = lastName;
            }
            if (department !== undefined) {
                if (department === null || department === "") {
                    sendValidationError(res, "department cannot be empty if provided");
                    return;
                }
                if (!isNonEmptyString(department)) {
                    sendValidationError(res, "department must be a non-empty string");
                    return;
                }
                updateData.department = department;
            }
            if (designation !== undefined) {
                if (designation === null || designation === "") {
                    sendValidationError(res, "designation cannot be empty if provided");
                    return;
                }
                if (!isNonEmptyString(designation)) {
                    sendValidationError(res, "designation must be a non-empty string");
                    return;
                }
                updateData.designation = designation;
            }
            if (phone !== undefined && phone !== null) {
                if (phone !== "" && !isNonEmptyString(phone)) {
                    sendValidationError(res, "phone must be a non-empty string");
                    return;
                }
                updateData.phone = phone === "" ? undefined : phone;
            }
            if (Object.keys(updateData).length === 0) {
                sendValidationError(res, "At least one field must be provided for update");
                return;
            }
            const employee = await EmployeeService.update(companyId, id, updateData);
            res.status(200).json({
                message: "Employee updated successfully",
                data: employee,
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
                res.status(404).json({
                    message: "Employee not found",
                });
                return;
            }
            console.error("Update employee failed:", error);
            res.status(500).json({
                message: "Failed to update employee",
            });
        }
    }
    static async delete(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user?.companyId;
            if (!companyId) {
                sendValidationError(res, "Unauthorized", 401);
                return;
            }
            if (!isNonEmptyString(id)) {
                sendValidationError(res, "Employee ID is required");
                return;
            }
            await EmployeeService.delete(companyId, id);
            res.status(200).json({
                message: "Employee deleted successfully",
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
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
}
