import { createDb } from "./index.js";
import { migrate } from "./migrate.js";

const databaseUrl = process.env.DATABASE_URL ?? "pglite://./data";

const db = await createDb(databaseUrl);
const ran = await migrate(db);

console.log(
  ran.length === 0
    ? "Database is up to date."
    : `Applied ${ran.length} migration(s): ${ran.join(", ")}`,
);

await db.close();
