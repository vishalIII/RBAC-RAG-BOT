import pool from '../config/db.js';

/**
 * Generates a unique tenant ID in the format TEN-XXXXXX
 * (6 uppercase alphanumeric characters). Retries on collision.
 */
export const generateTenantId = async (): Promise<string> => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const tenantId = `TEN-${suffix}`;

    const { rows } = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM companies WHERE tenant_id = $1) AS exists',
      [tenantId],
    );

    if (!rows[0].exists) return tenantId;
  }

  throw new Error('Failed to generate unique tenant ID after 10 attempts');
};