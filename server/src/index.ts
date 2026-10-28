import process from "node:process";
import { loadConfig } from "./config.js";
import { createDb } from "./db/index.js";
import { migrate } from "./db/migrate.js";
import { buildApp } from "./app.js";

/* .env is optional; real deployments set variables in the environment. */
try {
  process.loadEnvFile();
} catch {
  /* No .env file: fine. */
}

const config = loadConfig();
const db = await createDb(config.databaseUrl);

const applied = await migrate(db);
if (applied.length > 0) {
  console.log(`Applied migrations: ${applied.join(", ")}`);
}

const app = await buildApp({ config, db, logger: true });

await app.listen({ port: config.port, host: "127.0.0.1" });

if (!config.oidc) {
  console.warn(
    "Sign-in is not configured. Set OIDC_ISSUER, OIDC_CLIENT_ID, and " +
      "OIDC_CLIENT_SECRET to enable /auth/login.",
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
