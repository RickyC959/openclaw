import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/index.js";
import { getSession, type SessionContext } from "./session.js";

/**
 * Loads the session from the cookie and attaches it to the request. Rejects with
 * 401 when there is no valid session. The session is the only source of truth
 * for who the caller is and which institution they belong to.
 */
export function requireAuth(db: Db, config: AppConfig) {
  return async function authGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = request.cookies[config.session.cookieName];
    const session: SessionContext | null = token
      ? await getSession(db, token)
      : null;

    if (!session) {
      await reply.code(401).send({
        error: "unauthorized",
        message: "Sign in to continue.",
      });
      return;
    }

    request.atlasSession = session;
  };
}

/**
 * CSRF defence for state-changing requests. SameSite=Lax already blocks most
 * cross-site POSTs; this also rejects a mismatched Origin when one is present.
 */
export function sameOriginOnly(config: AppConfig) {
  const expected = new URL(config.appBaseUrl).origin;

  return async function originGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const origin = request.headers.origin;
    if (origin && origin !== expected) {
      await reply.code(403).send({
        error: "forbidden",
        message: "Cross-origin request rejected.",
      });
    }
  };
}

export function sessionCookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    secure: config.session.secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(config.session.ttlMs / 1000),
  };
}
