import process from "node:process";
import { loadConfig } from "./config.js";
import { createDb } from "./db/index.js";
import { migrate } from "./db/migrate.js";
import { seed } from "./db/seed.js";
import { buildApp } from "./app.js";

/* .env is optional; real deployments set variables in the environment. */
try {
  process.loadEnvFile();
} catch {
  /* No .env file: fine. */
}

const config = loadConfig();
const db = await createDb(config.databaseUrl);

/**
 * In a container the database may still be starting. Retry only for a real
 * Postgres connection; an embedded PGlite failure is a schema problem and
 * retrying would just hide it.
 */
async function applyMigrations(): Promise<string[]> {
  const isPostgres = /^postgres(ql)?:\/\//.test(config.databaseUrl);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await migrate(db);
    } catch (error) {
      if (!isPostgres || attempt >= 15) {
        throw error;
      }
      console.warn(
        `Database not ready (attempt ${attempt}); retrying in 1s.`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

const applied = await applyMigrations();
if (applied.length > 0) {
  console.log(`Applied migrations: ${applied.join(", ")}`);
}

if (config.seedDemoData) {
  await seed(db);
  console.log("Demo data seeded.");
}

const app = await buildApp({ config, db, logger: true });

await app.listen({ port: config.port, host: config.host });

if (!config.oidc) {
  console.warn(
    "Sign-in is not configured. Set OIDC_ISSUER, OIDC_CLIENT_ID, and " +
      "OIDC_CLIENT_SECRET to enable /auth/login.",
  );
} else if (config.devMockIdp) {
  console.warn(
    [
      "",
      "  ┌──────────────────────────────────────────────────────────────┐",
      "  │  DEVELOPMENT MODE: fake identity provider is enabled.        │",
      "  │  Sign-in verifies nothing. Never use this in production.     │",
      "  └──────────────────────────────────────────────────────────────┘",
      "  Demo accounts: ada@uni-a.edu, grace@uni-a.edu, bob@uni-b.edu",
      "",
    ].join("\n"),
  );
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, shutting down.`);
  await app.close();
  await db.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
