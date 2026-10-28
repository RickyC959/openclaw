import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createSession } from "../src/auth/session.js";
import { createFixture, type Fixture } from "./helpers.js";

let fixture: Fixture;
let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
  await fixture?.db.close();
});

async function signInAs(f: Fixture, accountId: string): Promise<string> {
  const { token } = await createSession(
    f.db,
    accountId,
    {},
    f.config.session.ttlMs,
  );
  return token;
}

describe("API v1", () => {
  it("returns 401 without a session", async () => {
    fixture = await createFixture();
    app = await buildApp({ config: fixture.config, db: fixture.db });

    for (const url of ["/api/v1/me", "/api/v1/clubs", "/app"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(401);
    }
  });

  it("returns the signed-in account and institution", async () => {
    fixture = await createFixture();
    app = await buildApp({ config: fixture.config, db: fixture.db });
    const token = await signInAs(fixture, fixture.ids.accountA);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      cookies: { atlas_session: token },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.account.email).toBe("ada@a.edu");
    expect(body.institution.slug).toBe("uni-a");
  });

  it("lists only clubs from the caller's institution", async () => {
    fixture = await createFixture();
    app = await buildApp({ config: fixture.config, db: fixture.db });
    const token = await signInAs(fixture, fixture.ids.accountA);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      cookies: { atlas_session: token },
    });

    expect(response.statusCode).toBe(200);
    const names = response.json().clubs.map((club: { name: string }) => club.name);
    expect(names).toEqual(["Chess Society", "Rowing Club"]);
    expect(names).not.toContain("Debate Society");
  });

  it("404s for a club belonging to another institution", async () => {
    fixture = await createFixture();
    app = await buildApp({ config: fixture.config, db: fixture.db });
    const token = await signInAs(fixture, fixture.ids.accountA);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${fixture.ids.clubB}`,
      cookies: { atlas_session: token },
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns a club with its members for the correct institution", async () => {
    fixture = await createFixture();
    await fixture.db.query(
      `INSERT INTO membership (account_id, club_id, role) VALUES ($1, $2, 'officer')`,
      [fixture.ids.accountA, fixture.ids.clubA],
    );
    app = await buildApp({ config: fixture.config, db: fixture.db });
    const token = await signInAs(fixture, fixture.ids.accountA);

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/clubs/${fixture.ids.clubA}`,
      cookies: { atlas_session: token },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.club.name).toBe("Chess Society");
    expect(body.members).toHaveLength(1);
    expect(body.members[0].role).toBe("officer");
  });

  it("signs out and invalidates the session", async () => {
    fixture = await createFixture();
    app = await buildApp({ config: fixture.config, db: fixture.db });
    const token = await signInAs(fixture, fixture.ids.accountA);

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { atlas_session: token },
      headers: { origin: "http://localhost:3000" },
    });
    expect(logout.statusCode).toBe(303);

    const after = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      cookies: { atlas_session: token },
    });
    expect(after.statusCode).toBe(401);
  });

  it("rejects a cross-origin sign-out", async () => {
    fixture = await createFixture();
    app = await buildApp({ config: fixture.config, db: fixture.db });
    const token = await signInAs(fixture, fixture.ids.accountA);

    const response = await app.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { atlas_session: token },
      headers: { origin: "https://evil.example" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("renders the signed-in page without client-side JavaScript", async () => {
    fixture = await createFixture();
    app = await buildApp({ config: fixture.config, db: fixture.db });
    const token = await signInAs(fixture, fixture.ids.accountA);

    const response = await app.inject({
      method: "GET",
      url: "/app",
      cookies: { atlas_session: token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("University A");
    expect(response.body).toContain("Chess Society");
    expect(response.body).not.toContain("<script");
  });
});

describe("auth routes when sign-in is not configured", () => {
  it("explains the missing configuration instead of redirecting", async () => {
    fixture = await createFixture();
    app = await buildApp({ config: fixture.config, db: fixture.db });

    const response = await app.inject({ method: "GET", url: "/auth/login" });
    expect(response.statusCode).toBe(503);
    expect(response.body).toContain("not configured");
  });

  it("rejects a callback with no flow cookie", async () => {
    fixture = await createFixture();
    app = await buildApp({ config: fixture.config, db: fixture.db });

    const response = await app.inject({
      method: "GET",
      url: "/auth/callback?code=abc&state=xyz",
    });
    expect(response.statusCode).toBe(503);
  });
});
