import bcrypt from "bcryptjs";
import pool from "../../config/db.js";
import { generateTenantId } from "../../utils/tenant.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt.js";

import {
  RegisterDto,
  LoginDto,
} from "../../types/auth.types.js";

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

export class AuthService {
  static async register(data: RegisterDto) {
    const { company_name, email, password } = data;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query(
        "SELECT id FROM company_users WHERE email = $1",
        [email.toLowerCase()]
      );

      if (existing.rows.length > 0) {
        throw new Error("EMAIL_EXISTS");
      }

      const tenantId = await generateTenantId();

      const slug = company_name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      const companyResult = await client.query(
        `
        INSERT INTO companies
        (tenant_id, name, slug, is_active)
        VALUES ($1,$2,$3,true)
        RETURNING id, tenant_id, name, slug
        `,
        [tenantId, company_name.trim(), slug]
      );

      const company = companyResult.rows[0];

      const passwordHash = await bcrypt.hash(
        password,
        BCRYPT_ROUNDS
      );

      const userResult = await client.query(
        `
        INSERT INTO company_users
        (
          tenant_id,
          company_id,
          email,
          password_hash,
          role,
          is_active
        )
        VALUES ($1,$2,$3,$4,'manager',true)
        RETURNING
          id,
          tenant_id,
          company_id,
          email,
          role
        `,
        [
          tenantId,
          company.id,
          email.toLowerCase(),
          passwordHash,
        ]
      );

      const user = userResult.rows[0];

      await client.query(
        `
        UPDATE companies
        SET created_by = $1
        WHERE id = $2
        `,
        [user.id, company.id]
      );

      await client.query("COMMIT");

      const payload = {
        sub: user.id,
        role: user.role,
        tenant_id: user.tenant_id,
        company_id: user.company_id,
        user_table: "company_users",
      };

      return {
        message: "Tenant registered successfully",
        tenant: {
          tenant_id: company.tenant_id,
          company_id: company.id,
          name: company.name,
          slug: company.slug,
        },
        user,
        tokens: {
          access_token: signAccessToken(payload),
          refresh_token: signRefreshToken(payload),
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async login(data: LoginDto) {
    const { email, password, user_type, tenant_id } = data;

    if (user_type === "platform_admin") {
      const { rows } = await pool.query(
        `
        SELECT
          id,
          email,
          password_hash,
          role
        FROM platform_users
        WHERE email = $1
        `,
        [email.toLowerCase()]
      );

      const user = rows[0];

      if (!user) {
        throw new Error("INVALID_CREDENTIALS");
      }

      const match = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!match) {
        throw new Error("INVALID_CREDENTIALS");
      }

      const payload = {
        sub: user.id,
        role: "platform_admin",
        tenant_id: null,
        company_id: null,
        user_table: "platform_users",
      };

      return {
        user: {
          id: user.id,
          email: user.email,
          role: "platform_admin",
        },
        tokens: {
          access_token: signAccessToken(payload),
          refresh_token: signRefreshToken(payload),
        },
      };
    }

    let query: string;
    let params: unknown[];

    if (tenant_id) {
      query = `
        SELECT
          cu.*,
          c.name AS company_name,
          c.slug AS company_slug
        FROM company_users cu
        JOIN companies c
          ON c.id = cu.company_id
        WHERE cu.email = $1
          AND cu.tenant_id = $2
      `;

      params = [
        email.toLowerCase(),
        tenant_id.toUpperCase(),
      ];
    } else {
      query = `
        SELECT
          cu.*,
          c.name AS company_name,
          c.slug AS company_slug
        FROM company_users cu
        JOIN companies c
          ON c.id = cu.company_id
        WHERE cu.email = $1
      `;

      params = [email.toLowerCase()];
    }

    const { rows } = await pool.query(query, params);

    const user = rows[0];

    if (!user) {
      throw new Error("INVALID_CREDENTIALS");
    }

    if (!user.is_active) {
      throw new Error("ACCOUNT_DISABLED");
    }

    const match = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!match) {
      throw new Error("INVALID_CREDENTIALS");
    }

    const payload = {
      sub: user.id,
      role: user.role,
      tenant_id: user.tenant_id,
      company_id: user.company_id,
      user_table: "company_users",
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        company_id: user.company_id,
        company_name: user.company_name,
        company_slug: user.company_slug,
      },
      tokens: {
        access_token: signAccessToken(payload),
        refresh_token: signRefreshToken(payload),
      },
    };
  }

  static async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);

    if (payload.user_table === "company_users") {
      const { rows } = await pool.query(
        `
        SELECT is_active
        FROM company_users
        WHERE id = $1
          AND tenant_id = $2
        `,
        [payload.sub, payload.tenant_id]
      );

      if (!rows[0]?.is_active) {
        throw new Error("ACCOUNT_DISABLED");
      }
    }

    return {
      access_token: signAccessToken({
        sub: payload.sub,
        role: payload.role,
        tenant_id: payload.tenant_id,
        company_id: payload.company_id,
        user_table: payload.user_table,
      }),
    };
  }
}