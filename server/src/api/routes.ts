import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/index.js";
import { requireAuth } from "../auth/guard.js";

interface ClubRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

/**
 * Every query filters by the session's institution. The institution is never
 * read from the request, so a caller cannot ask for another university's data.
 */
export function registerApiRoutes(
  app: FastifyInstance,
  config: AppConfig,
  db: Db,
): void {
  const guard = requireAuth(db, config);

  app.get("/api/v1/me", { preHandler: guard }, async (request) => {
    const session = request.atlasSession!;
    return {
      account: {
        id: session.account.id,
        email: session.account.email,
        fullName: session.account.full_name,
        role: session.account.role,
      },
      institution: {
        slug: session.institution.slug,
        name: session.institution.name,
        domain: session.institution.domain,
      },
    };
  });

  app.get("/api/v1/clubs", { preHandler: guard }, async (request) => {
    const session = request.atlasSession!;

    const clubs = await db.query<ClubRow>(
      `SELECT id, slug, name, description
         FROM club
        WHERE institution_id = $1
          AND is_active = true
        ORDER BY name ASC`,
      [session.institution.id],
    );

    return { clubs };
  });

  app.get<{ Params: { id: string } }>(
    "/api/v1/clubs/:id",
    { preHandler: guard },
    async (request, reply) => {
      const session = request.atlasSession!;

      const clubs = await db.query<ClubRow>(
        `SELECT id, slug, name, description
           FROM club
          WHERE id = $1
            AND institution_id = $2`,
        [request.params.id, session.institution.id],
      );

      const club = clubs[0];
      if (!club) {
        // Same 404 whether the club does not exist or belongs to another
        // institution: no existence leak across tenants.
        return reply.code(404).send({
          error: "not_found",
          message: "Club not found.",
        });
      }

      const members = await db.query<{
        id: string;
        email: string;
        fullName: string | null;
        role: string;
      }>(
        `SELECT a.id, a.email, a.full_name AS "fullName", m.role
           FROM membership m
           JOIN account a ON a.id = m.account_id
          WHERE m.club_id = $1
            AND a.institution_id = $2
          ORDER BY a.full_name NULLS LAST, a.email`,
        [club.id, session.institution.id],
      );

      return { club, members };
    },
  );
}
