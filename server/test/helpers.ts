import { createDb, type Db } from "../src/db/index.js";
import { migrate } from "../src/db/migrate.js";
import { loadConfig, type AppConfig } from "../src/config.js";

export interface Fixture {
  db: Db;
  config: AppConfig;
  ids: {
    institutionA: string;
    institutionB: string;
    accountA: string;
    accountB: string;
    clubA: string;
    clubB: string;
  };
}

const TEST_SECRET = "test-secret-not-used-outside-tests";

export async function makeConfig(
  overrides: Partial<AppConfig> = {},
): Promise<AppConfig> {
  const config = loadConfig({
    NODE_ENV: "test",
    APP_BASE_URL: "http://localhost:3000",
    DATABASE_URL: "memory://",
    SESSION_SECRET: TEST_SECRET,
    COOKIE_SECURE: "false",
  });

  return { ...config, oidc: null, ...overrides };
}

export async function createFixture(): Promise<Fixture> {
  const db = await createDb("memory://");
  await migrate(db);

  const institutions = await db.query<{ id: string }>(
    `INSERT INTO institution (slug, name, domain, sso_issuer, sso_client_id)
     VALUES ('uni-a', 'University A', 'a.edu', 'https://idp.a.edu', 'client-a'),
            ('uni-b', 'University B', 'b.edu', 'https://idp.b.edu', 'client-b')
     RETURNING id, slug`,
  );

  const institutionA = institutions[0]!.id;
  const institutionB = institutions[1]!.id;

  const accounts = await db.query<{ id: string }>(
    `INSERT INTO account (institution_id, email, full_name, oidc_sub)
     VALUES ($1, 'ada@a.edu', 'Ada', 'sub-a'),
            ($2, 'bob@b.edu', 'Bob', 'sub-b')
     RETURNING id`,
    [institutionA, institutionB],
  );

  const accountA = accounts[0]!.id;
  const accountB = accounts[1]!.id;

  const clubs = await db.query<{ id: string }>(
    `INSERT INTO club (institution_id, slug, name, description)
     VALUES ($1, 'chess', 'Chess Society', 'Weekly games.'),
            ($1, 'rowing', 'Rowing Club', NULL),
            ($2, 'debate', 'Debate Society', 'Other campus.')
     RETURNING id`,
    [institutionA, institutionB],
  );

  return {
    db,
    config: await makeConfig(),
    ids: {
      institutionA,
      institutionB,
      accountA,
      accountB,
      clubA: clubs[0]!.id,
      clubB: clubs[2]!.id,
    },
  };
}
