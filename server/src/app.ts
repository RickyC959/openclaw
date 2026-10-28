import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "./config.js";
import type { Db } from "./db/index.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerApiRoutes } from "./api/routes.js";
import { requireAuth } from "./auth/guard.js";
import { escapeHtml, page } from "./html.js";

export interface BuildAppOptions {
  config: AppConfig;
  db: Db;
  logger?: boolean;
}

export async function buildApp({
  config,
  db,
  logger = false,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    trustProxy: true,
    // Cookies are small; reject anything absurd early.
    bodyLimit: 64 * 1024,
  });

  await app.register(cookie);
  await app.register(helmet, {
    // No inline scripts anywhere, so the strict default policy is kept.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  });

  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/", async (_request, reply) => {
    return reply
      .type("text/html")
      .send(
        page(
          "Atlas server",
          `<h1>Atlas server</h1>
           <div class="box">
             <p>This is the Phase 1 backend: sign-in and the read-only API.</p>
             <p class="muted">Endpoints: <code>/auth/login</code>,
             <code>/auth/me</code>, <code>/api/v1/me</code>,
             <code>/api/v1/clubs</code>.</p>
           </div>`,
        ),
      );
  });

  registerAuthRoutes(app, config, db);
  registerApiRoutes(app, config, db);

  const guard = requireAuth(db, config);

  /*
   * A server-rendered first version of the signed-in area. Deliberately plain:
   * no client JavaScript, so the strict CSP holds and the page works before the
   * React app exists in Phase 2.
   */
  app.get("/app", { preHandler: guard }, async (request, reply) => {
    const session = request.atlasSession!;

    const clubs = await db.query<{ id: string; name: string; description: string | null }>(
      `SELECT id, name, description
         FROM club
        WHERE institution_id = $1 AND is_active = true
        ORDER BY name ASC`,
      [session.institution.id],
    );

    const list =
      clubs.length > 0
        ? `<ul>${clubs
            .map(
              (club) =>
                `<li><strong>${escapeHtml(club.name)}</strong>${
                  club.description
                    ? ` — ${escapeHtml(club.description)}`
                    : ""
                }</li>`,
            )
            .join("")}</ul>`
        : `<p class="muted">No clubs have been added for this university yet.</p>`;

    return reply.type("text/html").send(
      page(
        "Your campus",
        `<h1>${escapeHtml(session.institution.name)}</h1>
         <p class="muted">Signed in as <strong>${escapeHtml(session.account.email)}</strong>
         · <a href="/api/v1/me">account JSON</a></p>

         <h2>Clubs</h2>
         ${list}
         <p><a href="/api/v1/clubs">Clubs as JSON</a></p>

         <h2>Session</h2>
         <form method="post" action="/auth/logout">
           <button type="submit">Sign out</button>
         </form>`,
      ),
    );
  });

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({ error: "not_found" });
  });

  return app;
}
