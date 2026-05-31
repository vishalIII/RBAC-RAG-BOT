import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const migrationsDir = path.join(rootDir, "migrations");

const pool = new Pool({
  user: process.env.DB_USER ?? "postgres",
  host: process.env.DB_HOST ?? "localhost",
  database: process.env.DB_NAME ?? "rag_chatbot",
  password: process.env.DB_PASSWORD ?? "Vish@l",
  port: Number(process.env.DB_PORT ?? 5432),
});

const migrationFiles = (await fs.readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const filename of migrationFiles) {
    const applied = await client.query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [filename]
    );

    if (applied.rowCount) {
      console.log(`Skipped ${filename}`);
      continue;
    }

    const sql = await fs.readFile(
      path.join(migrationsDir, filename),
      "utf8"
    );

    await client.query("BEGIN");

    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [filename]
      );
      await client.query("COMMIT");
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
