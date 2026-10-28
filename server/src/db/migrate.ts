import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Db } from "./index.js";

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../migrations/", import.meta.url),
);

/**
 * Applies every .sql file in `migrationsDir` exactly once, in filename order.
 * Each migration runs in its own transaction, so a failure leaves no half-applied
 * schema behind.
 */
export async function migrate(
  db: Db,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (
      await db.query<{ name: string }>("SELECT name FROM schema_migrations")
    ).map((row) => row.name),
  );

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    await db.exec("BEGIN");
    try {
      await db.exec(sql);
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await db.exec("COMMIT");
      ran.push(file);
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }

  return ran;
}
