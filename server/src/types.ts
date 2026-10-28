import type { SessionContext } from "./auth/session.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the auth pre-handler on protected routes. */
    atlasSession: SessionContext | null;
  }
}
