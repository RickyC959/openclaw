import { randomBytes } from "node:crypto";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
}

export interface SessionConfig {
  secret: string;
  cookieName: string;
  ttlMs: number;
  secure: boolean;
}

export interface AppConfig {
  port: number;
  appBaseUrl: string;
  databaseUrl: string;
  /** null when sign-in is not configured; /auth/* then explains itself. */
  oidc: OidcConfig | null;
  session: SessionConfig;
  isProduction: boolean;
}

function intFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolFromEnv(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/**
 * Reads configuration once, at startup. Missing sign-in settings are not fatal:
 * the server still runs, and /auth/* says plainly that it is not configured.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appBaseUrl = (env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  const issuer = env.OIDC_ISSUER?.trim() ?? "";
  const clientId = env.OIDC_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.OIDC_CLIENT_SECRET?.trim() ?? "";

  const oidc: OidcConfig | null =
    issuer && clientId
      ? {
          issuer,
          clientId,
          clientSecret,
          scopes: env.OIDC_SCOPES?.trim() || "openid profile email",
          redirectUri: `${appBaseUrl}/auth/callback`,
        }
      : null;

  const isProduction = env.NODE_ENV === "production";

  let secret = env.SESSION_SECRET?.trim() ?? "";
  if (!secret) {
    if (isProduction) {
      throw new Error("SESSION_SECRET is required in production.");
    }
    // Development convenience: sessions die on restart, which is acceptable
    // locally and prevents shipping a hard-coded secret.
    secret = randomBytes(32).toString("base64");
  }

  return {
    port: intFromEnv(env.PORT, 3000),
    appBaseUrl,
    databaseUrl: env.DATABASE_URL ?? "pglite://./data",
    oidc,
    session: {
      secret,
      cookieName: env.SESSION_COOKIE_NAME?.trim() || "atlas_session",
      ttlMs: intFromEnv(env.SESSION_TTL_HOURS, 12) * 60 * 60 * 1000,
      secure: boolFromEnv(env.COOKIE_SECURE),
    },
    isProduction,
  };
}
