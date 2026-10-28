import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The in-flight OIDC state lives in a short-lived signed cookie instead of a
 * database row. Signing stops a caller from inventing their own verifier or
 * nonce; the expiry stops an old cookie being replayed.
 */
export interface OidcFlowState {
  state: string;
  verifier: string;
  nonce: string;
  institutionSlug?: string;
  expiresAt: number;
}

const FLOW_TTL_MS = 10 * 60 * 1000;

export const OIDC_FLOW_COOKIE = "atlas_oidc";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeFlowState(
  input: Omit<OidcFlowState, "expiresAt">,
  secret: string,
  now = Date.now(),
): { value: string; state: OidcFlowState } {
  const state: OidcFlowState = { ...input, expiresAt: now + FLOW_TTL_MS };
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString(
    "base64url",
  );
  return { value: `${payload}.${sign(payload, secret)}`, state };
}

/** Returns null for a missing, tampered, malformed, or expired cookie. */
export function decodeFlowState(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): OidcFlowState | null {
  if (!value) {
    return null;
  }

  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts as [string, string];
  const expected = sign(payload, secret);

  const given = Buffer.from(signature, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as OidcFlowState;

    if (
      typeof parsed.state !== "string" ||
      typeof parsed.verifier !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    if (parsed.expiresAt < now) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
