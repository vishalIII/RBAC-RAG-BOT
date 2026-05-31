import pool from "../../config/db.js";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

import { CreateEmployeeDto } from "../../types/employee.types.js";

import { generateTemporaryPassword } from "../../utils/generatePassword.js";
import { sendEmployeeCredentials } from "../../utils/employeeMailHelper.js";

function mapEmployeeRow(row: any) {
  return {
    ...row,
    employeeCode: row.employee_code,
    firstName: row.first_name,
    lastName: row.last_name,
    department: row.department,
    designation: row.designation,
    phone: row.phone,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class EmployeeService {
  static async create(
    tenantId: string,
    companyId: string,
    createdBy: string,
    data: CreateEmployeeDto,
  ) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const userId = uuidv4();
      const employeeId = uuidv4();

      const temporaryPassword = generateTemporaryPassword();

      const passwordHash = await bcrypt.hash(temporaryPassword, 10);

      const existingEmail = await client.query(
        `SELECT id FROM company_users WHERE email = $1`,
        [data.email.toLowerCase()],
      );

      if (existingEmail.rows.length > 0) {
        throw new Error("EMAIL_EXISTS");
      }

      const userResult = await client.query(
        `
        INSERT INTO company_users (
          id,
          tenant_id,
          company_id,
          email,
          password_hash,
          role,
          must_change_password,
          is_active,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW())
        RETURNING id,email,role
        `,
        [
          userId,
          tenantId,
          companyId,
          data.email.toLowerCase(),
          passwordHash,
          "employee",
          true,
        ],
      );

      const employeeResult = await client.query(
        `
        INSERT INTO employees (
          id,
          user_id,
          tenant_id,
          company_id,
          employee_code,
          first_name,
          last_name,
          department,
          designation,
          phone,
          created_by,
          created_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()
        )
        RETURNING *
        `,
        [
          employeeId,
          userId,
          tenantId,
          companyId,
          data.employeeCode,
          data.firstName,
          data.lastName,
          data.department,
          data.designation,
          data.phone ?? null,
          createdBy,
        ],
      );

      await client.query("COMMIT");

      try {
        await sendEmployeeCredentials(data.email, temporaryPassword);
      } catch (sendError) {
        console.error("Employee created but failed to send credentials email:", sendError);
      }

      return {
        user: userResult.rows[0],
        employee: mapEmployeeRow(employeeResult.rows[0]),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async getAll(tenantId: string, companyId: string) {
    const { rows } = await pool.query(
      `
    SELECT
      e.*,
      u.email
    FROM employees e
    JOIN company_users u
      ON u.id = e.user_id
    WHERE e.tenant_id = $1
      AND e.company_id = $2
    ORDER BY e.created_at DESC
    `,
      [tenantId, companyId],
    );

    return rows.map(mapEmployeeRow);
  }

  static async getById(tenantId: string, companyId: string, employeeId: string) {
    const { rows } = await pool.query(
      `
    SELECT
      e.*,
      u.email
    FROM employees e
    JOIN company_users u
      ON u.id = e.user_id
    WHERE e.id = $1
      AND e.tenant_id = $2
      AND e.company_id = $3
    `,
      [employeeId, tenantId, companyId],
    );

    if (!rows[0]) {
      throw new Error("EMPLOYEE_NOT_FOUND");
    }

    return mapEmployeeRow(rows[0]);
  }

  static async update(
    tenantId: string,
    companyId: string,
    employeeId: string,
    data: Partial<CreateEmployeeDto>,
  ) {
    const { rows } = await pool.query(
      `
    UPDATE employees
    SET
      first_name = COALESCE($1, first_name),
      last_name = COALESCE($2, last_name),
      department = COALESCE($3, department),
      designation = COALESCE($4, designation),
      phone = COALESCE($5, phone),
      updated_at = NOW()
    WHERE id = $6
      AND tenant_id = $7
      AND company_id = $8
    RETURNING *
    `,
      [
        data.firstName,
        data.lastName,
        data.department,
        data.designation,
        data.phone,
        employeeId,
        tenantId,
        companyId,
      ],
    );

    if (!rows[0]) {
      throw new Error("EMPLOYEE_NOT_FOUND");
    }

    return mapEmployeeRow(rows[0]);
  }

  static async delete(tenantId: string, companyId: string, employeeId: string) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const employeeResult = await client.query(
        `
      SELECT user_id
      FROM employees
      WHERE id = $1
        AND tenant_id = $2
        AND company_id = $3
      `,
        [employeeId, tenantId, companyId],
      );

      const employee = employeeResult.rows[0];

      if (!employee) {
        throw new Error("EMPLOYEE_NOT_FOUND");
      }

      await client.query(
        `
      DELETE FROM employees
      WHERE id = $1
      `,
        [employeeId],
      );

      await client.query(
        `
      DELETE FROM company_users
      WHERE id = $1
      `,
        [employee.user_id],
      );

      await client.query("COMMIT");

      return {
        message: "Employee deleted successfully",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
