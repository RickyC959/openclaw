import process from "node:process";
import { createDb } from "./index.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";

try {
  process.loadEnvFile();
} catch {
  /* No .env file: defaults apply. */
}

const databaseUrl = process.env.DATABASE_URL ?? "pglite://./data";
const db = await createDb(databaseUrl);

await migrate(db);
await seed(db);
await db.close();

console.log("Seed complete: 2 universities, 5 clubs, 3 accounts.");
