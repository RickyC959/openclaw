import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";

/** The small surface the rest of the server needs from a database. */
export interface Db {
  query<T extends object>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** For migrations: multiple statements are allowed. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/**
 * Local development and tests use embedded Postgres (PGlite), so no external
 * service is required. Production passes a normal postgres:// URL.
 */
export async function createDb(databaseUrl: string): Promise<Db> {
  if (isPostgresUrl(databaseUrl)) {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      // A hung connection should fail loudly rather than stall a request.
      connectionTimeoutMillis: 5_000,
    });

    return {
      async query<T extends object>(
        sql: string,
        params: unknown[] = [],
      ): Promise<T[]> {
        const result = await pool.query(sql, params);
        return result.rows as T[];
      },
      async exec(sql: string): Promise<void> {
        await pool.query(sql);
      },
      async close(): Promise<void> {
        await pool.end();
      },
    };
  }

  // "pglite://./data" -> "./data"; "memory://" stays in memory.
  const dataDir = databaseUrl.startsWith("pglite://")
    ? databaseUrl.slice("pglite://".length) || "memory://"
    : databaseUrl;

  const pglite = await PGlite.create(dataDir);

  return {
    async query<T extends object>(
      sql: string,
      params: unknown[] = [],
    ): Promise<T[]> {
      const result = await pglite.query<T>(sql, params);
      return result.rows;
    },
    async exec(sql: string): Promise<void> {
      await pglite.exec(sql);
    },
    async close(): Promise<void> {
      await pglite.close();
    },
  };
}
