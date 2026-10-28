import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { resetDiscoveryCache } from "../src/auth/oidc.js";
import { DEMO_ACCOUNTS } from "../src/dev/mock-idp.js";
import { createFixture, makeMockConfig, type Fixture } from "./helpers.js";

const ORIGIN = "http://localhost:3000";

let fixture: Fixture;
let app: FastifyInstance;
let realFetch: typeof fetch;

beforeEach(async () => {
  // Each app instance has its own signing key, so cached JWKS must not leak.
  resetDiscoveryCache();
  fixture = await createFixture(await makeMockConfig());
  app = await buildApp({ config: fixture.config, db: fixture.db });

  /*
   * The BFF calls the IdP over HTTP (discovery and token exchange). In the
   * test there is no listening port, so route those requests back into the app
   * itself. This exercises the real fetch/parse path without opening a socket.
   */
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.startsWith(ORIGIN)) {
      const response = await app.inject({
        method: (init?.method ?? "GET") as "GET" | "POST",
        url: url.slice(ORIGIN.length) || "/",
        headers: init?.headers as Record<string, string> | undefined,
        payload: init?.body ? String(init.body) : undefined,
      });

      return new Response(response.body, {
        status: response.statusCode,
        headers: { "content-type": "application/json" },
      });
    }

    return realFetch(input, init);
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  resetDiscoveryCache();
  await app.close();
  await fixture.db.close();
});

/** Runs /auth/login → mock authorize → /auth/callback and returns the session. */
async function completeSignIn(email: string): Promise<{
  sessionToken: string | undefined;
  callbackStatus: number;
  callbackLocation: string | undefined;
  callbackBody: string;
}> {
  const login = await app.inject({ method: "GET", url: "/auth/login" });
  expect(login.statusCode).toBe(302);

  const authorizeUrl = new URL(login.headers.location as string);
  expect(authorizeUrl.pathname).toBe("/dev-idp/authorize");

  const flowCookie = login.cookies.find((c) => c.name === "atlas_oidc");
  expect(flowCookie).toBeDefined();

  const params = authorizeUrl.searchParams;

  const authorize = await app.inject({
    method: "POST",
    url: "/dev-idp/authorize",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams({
      client_id: params.get("client_id") ?? "",
      redirect_uri: params.get("redirect_uri") ?? "",
      nonce: params.get("nonce") ?? "",
      code_challenge: params.get("code_challenge") ?? "",
      state: params.get("state") ?? "",
      scope: params.get("scope") ?? "",
      email,
    }).toString(),
  });

  expect(authorize.statusCode).toBe(302);
  const callbackUrl = new URL(authorize.headers.location as string);

  const callback = await app.inject({
    method: "GET",
    url: `${callbackUrl.pathname}${callbackUrl.search}`,
    cookies: { atlas_oidc: flowCookie!.value },
  });

  const session = callback.cookies.find((c) => c.name === "atlas_session");

  return {
    sessionToken: session?.value,
    callbackStatus: callback.statusCode,
    callbackLocation: callback.headers.location as string | undefined,
    callbackBody: callback.body,
  };
}

describe("full sign-in against the development IdP", () => {
  it("signs in, sets an httpOnly session cookie, and scopes the API", async () => {
    const result = await completeSignIn(DEMO_ACCOUNTS[0]!.email);

    expect(result.callbackStatus).toBe(302);
    expect(result.callbackLocation).toBe("/app");
    expect(result.sessionToken).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      cookies: { atlas_session: result.sessionToken! },
    });

    expect(me.statusCode).toBe(200);
    const body = me.json();
    expect(body.account.email).toBe("ada@uni-a.edu");
    expect(body.institution.slug).toBe("uni-a");

    const clubs = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      cookies: { atlas_session: result.sessionToken! },
    });
    expect(clubs.statusCode).toBe(200);

    const names = clubs.json().clubs.map((club: { name: string }) => club.name);
    expect(names).toContain("Chess Society");
    expect(names).not.toContain("Debate Society");
  });

  it("gives a different university only its own clubs", async () => {
    const result = await completeSignIn("bob@uni-b.edu");

    const clubs = await app.inject({
      method: "GET",
      url: "/api/v1/clubs",
      cookies: { atlas_session: result.sessionToken! },
    });

    const names = clubs.json().clubs.map((club: { name: string }) => club.name);
    expect(names).toContain("Debate Society");
    expect(names).not.toContain("Chess Society");
  });

  it("refuses an email domain that is not a participating university", async () => {
    const result = await completeSignIn("someone@elsewhere.example");

    expect(result.callbackStatus).toBe(403);
    expect(result.callbackBody).toContain("University not supported");
    expect(result.sessionToken).toBeUndefined();
  });

  it("rejects a callback whose state does not match the flow cookie", async () => {
    const login = await app.inject({ method: "GET", url: "/auth/login" });
    const authorizeUrl = new URL(login.headers.location as string);
    const flowCookie = login.cookies.find((c) => c.name === "atlas_oidc")!;

    const callback = await app.inject({
      method: "GET",
      url: "/auth/callback?code=abc&state=not-the-right-state",
      cookies: { atlas_oidc: flowCookie.value },
    });

    expect(callback.statusCode).toBe(401);
    expect(callback.body).toContain("could not be verified");
  });
});

describe("development IdP is not exposed by default", () => {
  it("is not mounted when the flag is off", async () => {
    const plain = await createFixture();
    const plainApp = await buildApp({ config: plain.config, db: plain.db });

    const response = await plainApp.inject({
      method: "GET",
      url: "/dev-idp/.well-known/openid-configuration",
    });

    expect(response.statusCode).toBe(404);
    await plainApp.close();
    await plain.db.close();
  });
});
