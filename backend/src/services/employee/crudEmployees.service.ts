import pool from "../../config/db.js";
import bcrypt from "bcryptjs";
// import { v4 as uuidv4 } from "uuid";

import {
  CreateEmployeeDto,
  CreateManagerDto,
} from "../../types/employee.types.js";

import { generateTemporaryPassword } from "../../utils/generatePassword.js";
import { sendEmployeeCredentials } from "../../utils/employeeMailHelper.js";
import { AnyRecord } from "dns";

function mapEmployeeRow(row: any) {
  return {
    ...row,
    employeeCode: row.employee_code,
    firstName: row.first_name,
    lastName: row.last_name,
    departmentId: row.department_id,
    managerId: row.manager_id,
    employmentStatus: row.employment_status,
    joiningDate: row.joining_date,
    designation: row.designation,
    phone: row.phone,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class EmployeeService {
  static async create(
    companyId: string,
    createdBy: string,
    data: CreateEmployeeDto,
  ) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const temporaryPassword = generateTemporaryPassword();

      const passwordHash = await bcrypt.hash(temporaryPassword, 10);

      const existingEmail = await client.query(
        `
      SELECT id
      FROM company_users
      WHERE email = $1
      `,
        [data.email.toLowerCase()],
      );

      if (existingEmail.rows.length > 0) {
        throw new Error("EMAIL_EXISTS");
      }

      // ============================================================
      // Validate Department

      if (data.departmentId) {
        const department = await client.query(
          `
        SELECT id
        FROM departments
        WHERE id = $1
          AND company_id = $2
        `,
          [data.departmentId, companyId],
        );

        if (department.rows.length === 0) {
          throw new Error("DEPARTMENT_NOT_FOUND");
        }
      }

      // ============================================================
      // Validate Manager

      if (data.managerId) {
        const manager = await client.query(
          `
        SELECT id
        FROM employees
        WHERE id = $1
          AND company_id = $2
        `,
          [data.managerId, companyId],
        );

        if (manager.rows.length === 0) {
          throw new Error("MANAGER_NOT_FOUND");
        }
      }

      // ============================================================
      // Create Login User
      console.log({
        companyId,
        createdBy,
      });

      const userResult = await client.query(
        `
      INSERT INTO company_users (
        company_id,
        email,
        password_hash,
        role,
        must_change_password,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'employee',
        true,
        true,
        NOW(),
        NOW()
      )
      RETURNING id, email, role
      `,
        [companyId, data.email.toLowerCase(), passwordHash],
      );

      const user = userResult.rows[0];

      // ============================================================
      // Create Employee Profile

      let managerId: string | null = null;

      const creator = await client.query(
        `
  SELECT
      cu.role,
      e.id AS employee_id
  FROM company_users cu
  LEFT JOIN employees e
      ON e.user_id = cu.id
  WHERE cu.id = $1
  `,
        [createdBy],
      );

      if (creator.rows.length > 0 && creator.rows[0].role === "manager") {
        managerId = creator.rows[0].employee_id;
      }

      const employeeResult = await client.query(
        `
      INSERT INTO employees (
        user_id,
        company_id,
        manager_id,
        employment_status,
        joining_date,
        department_id,
        employee_code,
        first_name,
        last_name,
        designation,
        phone,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW()
      )
      RETURNING *
      `,
        [
          user.id,
          companyId,
          managerId,
          data.employmentStatus ?? "active",
          data.joiningDate ?? null,
          data.departmentId ?? null,
          data.employeeCode,
          data.firstName,
          data.lastName,
          data.designation,
          data.phone ?? null,
          createdBy,
        ],
      );

      await client.query("COMMIT");

      try {
        await sendEmployeeCredentials(data.email, temporaryPassword);
      } catch (sendError) {
        console.error(
          "Employee created but failed to send credentials email:",
          sendError,
        );
      }

      return {
        user,
        employee: mapEmployeeRow(employeeResult.rows[0]),
      };
    } catch (error: any) {
      await client.query("ROLLBACK");

      if (error.code === "23505") {
        throw new Error("EMPLOYEE_CODE_EXISTS");
      }

      throw error;
    } finally {
      client.release();
    }
  }

  static async getAll(companyId: string) {
    const { rows } = await pool.query(
      `
    SELECT
      e.*,
      u.email
    FROM employees e
    JOIN company_users u
      ON u.id = e.user_id
    WHERE e.company_id = $1
    ORDER BY e.created_at DESC
    `,
      [companyId],
    );

    return rows.map(mapEmployeeRow);
  }

  static async getById(companyId: string, employeeId: string) {
    const { rows } = await pool.query(
      `
    SELECT
      e.*,
      u.email
    FROM employees e
    JOIN company_users u
      ON u.id = e.user_id
    WHERE e.id = $1
      AND e.company_id = $2
    `,
      [employeeId, companyId],
    );

    if (!rows[0]) {
      throw new Error("EMPLOYEE_NOT_FOUND");
    }

    return mapEmployeeRow(rows[0]);
  }

  static async update(
    companyId: string,
    employeeId: string,
    data: Partial<CreateEmployeeDto>,
  ) {
    // ==========================================
    // Validate Department

    if (data.departmentId) {
      const department = await pool.query(
        `
      SELECT id
      FROM departments
      WHERE id = $1
        AND company_id = $2
      `,
        [data.departmentId, companyId],
      );

      if (department.rows.length === 0) {
        throw new Error("DEPARTMENT_NOT_FOUND");
      }
    }

    // ==========================================
    // Validate Manager

    if (data.managerId) {
      const manager = await pool.query(
        `
      SELECT id
      FROM employees
      WHERE id = $1
        AND company_id = $2
      `,
        [data.managerId, companyId],
      );

      if (manager.rows.length === 0) {
        throw new Error("MANAGER_NOT_FOUND");
      }
    }

    const { rows } = await pool.query(
      `
    UPDATE employees
    SET
      first_name = COALESCE($1, first_name),
      last_name = COALESCE($2, last_name),
      department_id = COALESCE($3, department_id),
      designation = COALESCE($4, designation),
      phone = COALESCE($5, phone),
      manager_id = COALESCE($6, manager_id),
      employment_status = COALESCE($7, employment_status),
      joining_date = COALESCE($8, joining_date),
      updated_at = NOW()
    WHERE id = $9
      AND company_id = $10
    RETURNING *
    `,
      [
        data.firstName,
        data.lastName,
        data.departmentId,
        data.designation,
        data.phone,
        data.managerId,
        data.employmentStatus,
        data.joiningDate,
        employeeId,
        companyId,
      ],
    );

    if (!rows[0]) {
      throw new Error("EMPLOYEE_NOT_FOUND");
    }

    return mapEmployeeRow(rows[0]);
  }

  static async delete(companyId: string, employeeId: string) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `
      SELECT user_id
      FROM employees
      WHERE id = $1
        AND company_id = $2
      `,
        [employeeId, companyId],
      );

      if (!rows[0]) {
        throw new Error("EMPLOYEE_NOT_FOUND");
      }

      await client.query(
        `
      DELETE FROM company_users
      WHERE id = $1
      `,
        [rows[0].user_id],
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

  static async createManager(
    companyId: string,
    createdBy: string,
    data: CreateManagerDto,
  ) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const temporaryPassword = generateTemporaryPassword();

      const passwordHash = await bcrypt.hash(temporaryPassword, 10);

      const existingEmail = await client.query(
        `
      SELECT id
      FROM company_users
      WHERE email = $1
      `,
        [data.email.toLowerCase()],
      );

      if (existingEmail.rows.length > 0) {
        throw new Error("EMAIL_EXISTS");
      }

      if (data.departmentId) {
        const department = await client.query(
          `
        SELECT id
        FROM departments
        WHERE id = $1
          AND company_id = $2
        `,
          [data.departmentId, companyId],
        );

        if (department.rows.length === 0) {
          throw new Error("DEPARTMENT_NOT_FOUND");
        }
      }

      const userResult = await client.query(
        `
      INSERT INTO company_users (
        company_id,
        email,
        password_hash,
        role,
        must_change_password,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'manager',
        true,
        true,
        NOW(),
        NOW()
      )
      RETURNING id,email,role
      `,
        [companyId, data.email.toLowerCase(), passwordHash],
      );

      const user = userResult.rows[0];

      const employeeResult = await client.query(
        `
      INSERT INTO employees (
        user_id,
        company_id,
        manager_id,
        employment_status,
        joining_date,
        department_id,
        employee_code,
        first_name,
        last_name,
        designation,
        phone,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW()
      )
      RETURNING *
      `,
        [
          user.id,
          companyId,
          data.employmentStatus ?? "active",
          data.joiningDate ?? null,
          data.departmentId ?? null,
          data.employeeCode,
          data.firstName,
          data.lastName,
          data.designation,
          data.phone ?? null,
          createdBy,
        ],
      );

      await client.query("COMMIT");

      try {
        await sendEmployeeCredentials(data.email, temporaryPassword);
      } catch (err) {
        console.error(err);
      }

      return {
        user,
        employee: mapEmployeeRow(employeeResult.rows[0]),
      };
    } catch (error: any) {
      await client.query("ROLLBACK");

      if (error.code === "23505") {
        throw new Error("EMPLOYEE_CODE_EXISTS");
      }

      throw error;
    } finally {
      client.release();
    }
  }
}
