import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { OidcConfig } from "../config.js";

export interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

interface CacheEntry {
  issuer: string;
  discovery: Discovery;
  jwks: ReturnType<typeof createRemoteJWKSet>;
  fetchedAt: number;
}

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
let cache: CacheEntry | null = null;

function normalizeIssuer(issuer: string): string {
  return issuer.replace(/\/$/, "");
}

export async function getDiscovery(issuer: string): Promise<CacheEntry> {
  const normalized = normalizeIssuer(issuer);

  if (
    cache &&
    cache.issuer === normalized &&
    Date.now() - cache.fetchedAt < DISCOVERY_TTL_MS
  ) {
    return cache;
  }

  const response = await fetch(
    `${normalized}/.well-known/openid-configuration`,
    { headers: { accept: "application/json" } },
  );

  if (!response.ok) {
    throw new Error(`OIDC discovery failed (${response.status})`);
  }

  const document = (await response.json()) as Partial<Discovery>;

  if (
    !document.authorization_endpoint ||
    !document.token_endpoint ||
    !document.jwks_uri
  ) {
    throw new Error("OIDC discovery document is missing required endpoints");
  }

  const discovery: Discovery = {
    issuer: document.issuer ?? normalized,
    authorization_endpoint: document.authorization_endpoint,
    token_endpoint: document.token_endpoint,
    jwks_uri: document.jwks_uri,
    ...(document.end_session_endpoint
      ? { end_session_endpoint: document.end_session_endpoint }
      : {}),
  };

  cache = {
    issuer: normalized,
    discovery,
    jwks: createRemoteJWKSet(new URL(discovery.jwks_uri)),
    fetchedAt: Date.now(),
  };

  return cache;
}

/** Test hook: drop cached discovery between runs. */
export function resetDiscoveryCache(): void {
  cache = null;
}

export function buildAuthorizeUrl(
  discovery: Discovery,
  oidc: OidcConfig,
  params: { state: string; nonce: string; codeChallenge: string },
  extra?: { prompt?: string },
): string {
  const url = new URL(discovery.authorization_endpoint);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", oidc.clientId);
  url.searchParams.set("redirect_uri", oidc.redirectUri);
  url.searchParams.set("scope", oidc.scopes);
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (extra?.prompt) {
    url.searchParams.set("prompt", extra.prompt);
  }

  return url.toString();
}

export interface TokenResponse {
  id_token: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

export async function exchangeCode(
  discovery: Discovery,
  oidc: OidcConfig,
  params: { code: string; codeVerifier: string },
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: oidc.redirectUri,
    client_id: oidc.clientId,
    code_verifier: params.codeVerifier,
  });

  /*
   * Client secret is optional: public clients (and some university IdPs) do not
   * issue one. Confidential clients send it with client_secret_post.
   */
  if (oidc.clientSecret) {
    body.set("client_secret", oidc.clientSecret);
  }

  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status})`);
  }

  const tokens = (await response.json()) as Partial<TokenResponse>;
  if (!tokens.id_token) {
    throw new Error("Token response did not include an ID token");
  }

  return tokens as TokenResponse;
}

/**
 * Verifies the ID token signature against the provider's JWKS, plus issuer,
 * audience, expiry, and the nonce we generated for this sign-in attempt.
 */
export async function verifyIdToken(
  entry: CacheEntry,
  oidc: OidcConfig,
  idToken: string,
  expectedNonce: string,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(idToken, entry.jwks, {
    issuer: [entry.discovery.issuer, entry.issuer],
    audience: oidc.clientId,
  });

  if (!payload.nonce || payload.nonce !== expectedNonce) {
    throw new Error("ID token nonce did not match");
  }

  return payload;
}

export function emailFromClaims(claims: JWTPayload): string | null {
  const candidate =
    claims.email ?? claims.preferred_username ?? claims.upn ?? null;
  return typeof candidate === "string" ? candidate.toLowerCase() : null;
}

export function displayNameFromClaims(claims: JWTPayload): string | null {
  return typeof claims.name === "string" ? claims.name : null;
}
