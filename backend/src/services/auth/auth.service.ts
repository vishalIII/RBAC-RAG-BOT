import bcrypt from "bcryptjs";
import pool from "../../config/db.js";
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

      const slug = company_name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      const companyResult = await client.query(
        `
        INSERT INTO companies
        (name, slug, is_active)
        VALUES ($1,$2,true)
        RETURNING id, name, slug
        `,
        [company_name.trim(), slug]
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
          company_id,
          email,
          password_hash,
          role,
          is_active
        )
        VALUES ($1,$2,$3,'owner',true)
        RETURNING
          id,
          company_id,
          email,
          role
        `,
        [
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
        id: user.id,
        sub: user.id,
        role: user.role,
        email: user.email,
        company_id: user.company_id,
        userType: "company_user",
        user_table: "company_users",
      };

      return {
        message: "Company registered successfully",
        company: {
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
  const { email, password } = data;

  const { rows } = await pool.query(
    `
    SELECT
      pu.id,
      pu.email,
      pu.password_hash,
      pu.role,
      'platform_admin' AS user_type,
      NULL::uuid AS company_id,
      true AS is_active,
      NULL::text AS company_name,
      NULL::text AS company_slug
    FROM platform_users pu
    WHERE pu.email = $1

    UNION ALL

    SELECT
      cu.id,
      cu.email,
      cu.password_hash,
      cu.role,
      'company_user' AS user_type,
      cu.company_id,
      cu.is_active,
      c.name AS company_name,
      c.slug AS company_slug
    FROM company_users cu
    JOIN companies c
      ON c.id = cu.company_id
    WHERE cu.email = $1
    `,
    [email.toLowerCase()]
  );

  const user = rows[0];

  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  if (
    user.user_type === "company_user" &&
    !user.is_active
  ) {
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
    id: user.id,
    sub: user.id,
    role:
      user.user_type === "platform_admin"
        ? "platform_admin"
        : user.role,
    email: user.email,
    company_id: user.company_id,
    userType: user.user_type,
    user_table:
      user.user_type === "platform_admin"
        ? "platform_users"
        : "company_users",
  };

  return {
    user: {
      id: user.id,
      email: user.email,
      role:
        user.user_type === "platform_admin"
          ? "platform_admin"
          : user.role,
      user_type: user.user_type,
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
    const userId = payload.id ?? payload.sub;

    if (
      payload.user_table !== "company_users" &&
      payload.user_table !== "platform_users"
    ) {
      throw new Error("INVALID_REFRESH_TOKEN");
    }

    const userType =
      payload.userType ??
      (payload.user_table === "platform_users"
        ? "platform_admin"
        : "company_user");
    let email = payload.email;

    if (payload.user_table === "company_users") {
      if (!payload.company_id) {
        throw new Error("INVALID_REFRESH_TOKEN");
      }

      const { rows } = await pool.query(
        `
        SELECT email, is_active
        FROM company_users
        WHERE id = $1
          AND company_id = $2
        `,
        [userId, payload.company_id]
      );

      if (!rows[0]?.is_active) {
        throw new Error("ACCOUNT_DISABLED");
      }

      email = rows[0].email;
    } else if (payload.user_table === "platform_users") {
      const { rows } = await pool.query(
        `
        SELECT email
        FROM platform_users
        WHERE id = $1
        `,
        [userId]
      );

      if (!rows[0]) {
        throw new Error("INVALID_REFRESH_TOKEN");
      }

      email = rows[0].email;
    }

    if (!userId || !email || !payload.role) {
      throw new Error("INVALID_REFRESH_TOKEN");
    }

    return {
      access_token: signAccessToken({
        id: userId,
        sub: userId,
        role: payload.role,
        email,
        company_id: payload.company_id,
        userType,
        user_table: payload.user_table,
      }),
    };
  }
}
