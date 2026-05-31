import pool from '../config/db.js';
import { v4 as uuidv4 } from "uuid";

/**
 * Generates a unique tenant ID using UUID v4.
 * Retries on collision, even though UUID collisions are extremely unlikely.
 */
export const generateTenantId = async (): Promise<string> => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const tenantId = uuidv4();

    const { rows } = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM companies WHERE tenant_id = $1) AS exists',
      [tenantId],
    );

    if (!rows[0].exists) return tenantId;
  }

  throw new Error('Failed to generate unique tenant UUID after 10 attempts');
};
