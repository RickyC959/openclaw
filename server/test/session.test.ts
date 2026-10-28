import { afterEach, describe, expect, it } from "vitest";
import {
  createSession,
  destroyAllSessions,
  destroySession,
  getSession,
  purgeExpiredSessions,
} from "../src/auth/session.js";
import { createFixture, type Fixture } from "./helpers.js";

let fixture: Fixture;

afterEach(async () => {
  await fixture?.db.close();
});

describe("sessions", () => {
  it("creates a session and resolves it back to the account and institution", async () => {
    fixture = await createFixture();
    const { token } = await createSession(
      fixture.db,
      fixture.ids.accountA,
      { userAgent: "vitest", ip: "127.0.0.1" },
      fixture.config.session.ttlMs,
    );

    const session = await getSession(fixture.db, token);
    expect(session).not.toBeNull();
    expect(session?.account.email).toBe("ada@uni-a.edu");
    expect(session?.institution.slug).toBe("uni-a");
  });

  it("stores only a hash of the token", async () => {
    fixture = await createFixture();
    const { token } = await createSession(
      fixture.db,
      fixture.ids.accountA,
      {},
      fixture.config.session.ttlMs,
    );

    const rows = await fixture.db.query<{ token_hash: string }>(
      "SELECT token_hash FROM session",
    );
    expect(rows[0]?.token_hash).not.toBe(token);
    expect(rows[0]?.token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an unknown token", async () => {
    fixture = await createFixture();
    expect(await getSession(fixture.db, "made-up")).toBeNull();
  });

  it("rejects an expired session", async () => {
    fixture = await createFixture();
    const { token } = await createSession(
      fixture.db,
      fixture.ids.accountA,
      {},
      -1_000, // already expired
    );
    expect(await getSession(fixture.db, token)).toBeNull();
  });

  it("revokes a single session on sign-out", async () => {
    fixture = await createFixture();
    const { token } = await createSession(
      fixture.db,
      fixture.ids.accountA,
      {},
      fixture.config.session.ttlMs,
    );

    await destroySession(fixture.db, token);
    expect(await getSession(fixture.db, token)).toBeNull();
  });

  it("revokes every session for an account", async () => {
    fixture = await createFixture();
    const first = await createSession(
      fixture.db,
      fixture.ids.accountA,
      {},
      fixture.config.session.ttlMs,
    );
    const second = await createSession(
      fixture.db,
      fixture.ids.accountA,
      {},
      fixture.config.session.ttlMs,
    );

    await destroyAllSessions(fixture.db, fixture.ids.accountA);
    expect(await getSession(fixture.db, first.token)).toBeNull();
    expect(await getSession(fixture.db, second.token)).toBeNull();
  });

  it("purges expired rows", async () => {
    fixture = await createFixture();
    await createSession(fixture.db, fixture.ids.accountA, {}, -1_000);
    await purgeExpiredSessions(fixture.db);

    const rows = await fixture.db.query("SELECT id FROM session");
    expect(rows).toHaveLength(0);
  });
});
