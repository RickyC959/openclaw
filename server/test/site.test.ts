import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createFixture, type Fixture } from "./helpers.js";

let fixture: Fixture | undefined;
let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
  if (fixture) {
    await fixture.db.close();
    fixture = undefined;
  }
});

async function start(): Promise<FastifyInstance> {
  const f = await createFixture();
  fixture = f;
  app = await buildApp({ config: f.config, db: f.db });
  return app;
}

describe("the marketing site is served by the app", () => {
  it("serves the overview page at /", async () => {
    const server = await start();
    const response = await server.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Atlas");
  });

  it("serves the stylesheet and script with the right content types", async () => {
    const server = await start();

    const css = await server.inject({ method: "GET", url: "/style.css" });
    expect(css.statusCode).toBe(200);
    expect(css.headers["content-type"]).toContain("text/css");

    const js = await server.inject({ method: "GET", url: "/script.js" });
    expect(js.statusCode).toBe(200);
    expect(js.headers["content-type"]).toContain("javascript");
  });

  it("serves every marketing page", async () => {
    const server = await start();

    for (const url of [
      "/index.html",
      "/download.html",
      "/signin.html",
    ]) {
      const response = await server.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(200);
    }
  });

  it("sign-in is a server redirect, not client-side token handling", async () => {
    const server = await start();
    const response = await server.inject({ method: "GET", url: "/signin.html" });

    expect(response.body).toContain('href="/auth/login"');
    expect(response.body).not.toContain("sessionStorage");
    expect(response.body).not.toContain("signin-start");
  });

  it("does not expose server files", async () => {
    const server = await start();

    for (const url of [
      "/server/src/config.ts",
      "/server/.env",
      "/AGENTS.md",
      "/package.json",
    ]) {
      const response = await server.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(404);
    }
  });
});

describe("config safety", () => {
  it("refuses to enable the fake IdP in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        SESSION_SECRET: "x".repeat(32),
        DEV_MOCK_IDP: "true",
      }),
    ).toThrow(/DEV_MOCK_IDP/);
  });

  it("prefers a real identity provider over the fake one", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      SESSION_SECRET: "x".repeat(32),
      DEV_MOCK_IDP: "true",
      OIDC_ISSUER: "https://idp.example.edu",
      OIDC_CLIENT_ID: "real-client",
    });

    expect(config.devMockIdp).toBe(false);
    expect(config.oidc?.issuer).toBe("https://idp.example.edu");
  });

  it("points the fake IdP at this server when enabled", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      APP_BASE_URL: "http://localhost:3000",
      SESSION_SECRET: "x".repeat(32),
      DEV_MOCK_IDP: "true",
    });

    expect(config.devMockIdp).toBe(true);
    expect(config.oidc?.issuer).toBe("http://localhost:3000/dev-idp");
    expect(config.oidc?.redirectUri).toBe(
      "http://localhost:3000/auth/callback",
    );
  });
});
