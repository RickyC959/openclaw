import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/index.js";
import {
  buildAuthorizeUrl,
  emailFromClaims,
  displayNameFromClaims,
  exchangeCode,
  getDiscovery,
  verifyIdToken,
} from "./oidc.js";
import { createCodeChallenge, createCodeVerifier, randomToken } from "./pkce.js";
import {
  decodeFlowState,
  encodeFlowState,
  OIDC_FLOW_COOKIE,
} from "./state.js";
import { createSession, destroySession } from "./session.js";
import { requireAuth, sameOriginOnly, sessionCookieOptions } from "./guard.js";
import { escapeHtml, page } from "../html.js";

const FLOW_COOKIE_MAX_AGE = 10 * 60; // seconds

export function registerAuthRoutes(
  app: FastifyInstance,
  config: AppConfig,
  db: Db,
): void {
  const oidc = config.oidc;
  const guard = requireAuth(db, config);

  /*
   * Sign-in is optional. When it is not configured, say so plainly instead of
   * redirecting somewhere that cannot work.
   */
  function notConfigured(): { status: number; body: string } {
    return {
      status: 503,
      body: page(
        "Sign-in not configured",
        `<h1>Sign-in is not configured</h1>
         <div class="box">
           <p>The server is running, but no university identity provider is set.</p>
           <p class="muted">Set <code>OIDC_ISSUER</code>, <code>OIDC_CLIENT_ID</code>
           and <code>OIDC_CLIENT_SECRET</code>, then restart.</p>
         </div>`,
      ),
    };
  }

  app.get("/auth/login", async (request, reply) => {
    if (!oidc) {
      const response = notConfigured();
      return reply.code(response.status).type("text/html").send(response.body);
    }

    const query = request.query as { inst?: string };
    const available = await getDiscovery(oidc.issuer);

    const verifier = createCodeVerifier();
    const state = randomToken(24);
    const nonce = randomToken(24);

    const { value } = encodeFlowState(
      {
        state,
        verifier,
        nonce,
        ...(query.inst ? { institutionSlug: query.inst } : {}),
      },
      config.session.secret,
    );

    reply.setCookie(OIDC_FLOW_COOKIE, value, {
      httpOnly: true,
      secure: config.session.secure,
      sameSite: "lax",
      path: "/",
      maxAge: FLOW_COOKIE_MAX_AGE,
    });

    const url = buildAuthorizeUrl(available.discovery, oidc, {
      state,
      nonce,
      codeChallenge: createCodeChallenge(verifier),
    });

    return reply.redirect(url);
  });

  app.get("/auth/callback", async (request, reply) => {
    if (!oidc) {
      const response = notConfigured();
      return reply.code(response.status).type("text/html").send(response.body);
    }

    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    const cookieValue = request.cookies[OIDC_FLOW_COOKIE];
    reply.clearCookie(OIDC_FLOW_COOKIE, { path: "/" });

    if (query.error) {
      return reply
        .code(401)
        .type("text/html")
        .send(
          page(
            "Sign-in cancelled",
            `<h1>Sign-in cancelled</h1>
             <div class="box"><p>The university sign-in service reported an error.</p>
             <p class="muted">${escapeHtml(query.error_description ?? query.error)}</p></div>
             <p><a href="/auth/login">Try again</a></p>`,
          ),
        );
    }

    const flow = decodeFlowState(cookieValue, config.session.secret);

    // A missing, expired, or forged flow cookie cannot be trusted.
    if (!flow || !query.code || !query.state || flow.state !== query.state) {
      return reply
        .code(401)
        .type("text/html")
        .send(
          page(
            "Sign-in could not be verified",
            `<h1>Sign-in could not be verified</h1>
             <div class="box"><p>This sign-in attempt is missing, expired, or was tampered with.</p></div>
             <p><a href="/auth/login">Start again</a></p>`,
          ),
        );
    }

    try {
      const available = await getDiscovery(oidc.issuer);
      const tokens = await exchangeCode(available.discovery, oidc, {
        code: query.code,
        codeVerifier: flow.verifier,
      });

      const claims = await verifyIdToken(
        available,
        oidc,
        tokens.id_token,
        flow.nonce,
      );

      const email = emailFromClaims(claims);
      if (!email) {
        throw new Error("ID token did not include an email claim");
      }

      const domain = email.slice(email.lastIndexOf("@") + 1);
      const institutions = await db.query<{
        id: string;
        slug: string;
        domain: string;
      }>(
        `SELECT id, slug, domain FROM institution WHERE lower(domain) = lower($1)`,
        [domain],
      );

      const institution = institutions[0];
      if (!institution) {
        return reply
          .code(403)
          .type("text/html")
          .send(
            page(
              "University not supported",
              `<h1>University not supported</h1>
               <div class="box"><p>Atlas is limited to participating universities, and
               <strong>${escapeHtml(domain)}</strong> is not one of them yet.</p></div>
               <p><a href="/">Back</a></p>`,
            ),
          );
      }

      if (flow.institutionSlug && flow.institutionSlug !== institution.slug) {
        return reply
          .code(403)
          .type("text/html")
          .send(
            page(
              "Wrong university",
              `<h1>Wrong university</h1>
               <div class="box"><p>This account belongs to a different institution.</p></div>`,
            ),
          );
      }

      const accounts = await db.query<{ id: string }>(
        `INSERT INTO account (institution_id, email, full_name, oidc_sub, last_login_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (institution_id, oidc_sub)
         DO UPDATE SET email = EXCLUDED.email,
                       full_name = COALESCE(EXCLUDED.full_name, account.full_name),
                       last_login_at = now()
         RETURNING id`,
        [
          institution.id,
          email,
          displayNameFromClaims(claims),
          String(claims.sub ?? ""),
        ],
      );

      const account = accounts[0];
      if (!account) {
        throw new Error("Account upsert returned no row");
      }

      const session = await createSession(
        db,
        account.id,
        { userAgent: request.headers["user-agent"], ip: request.ip },
        config.session.ttlMs,
      );

      reply.setCookie(
        config.session.cookieName,
        session.token,
        sessionCookieOptions(config),
      );

      return reply.redirect("/app");
    } catch (error) {
      request.log.warn({ err: error }, "OIDC callback failed");
      return reply
        .code(401)
        .type("text/html")
        .send(
          page(
            "Sign-in failed",
            `<h1>Sign-in failed</h1>
             <div class="box"><p>We could not complete sign-in. Please try again.</p></div>
             <p><a href="/auth/login">Try again</a></p>`,
          ),
        );
    }
  });

  app.get("/auth/me", { preHandler: guard }, async (request) => {
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
      },
    };
  });

  app.post(
    "/auth/logout",
    { preHandler: sameOriginOnly(config) },
    async (request, reply) => {
      const token = request.cookies[config.session.cookieName];
      if (token) {
        await destroySession(db, token);
      }
      reply.clearCookie(config.session.cookieName, { path: "/" });
      // 303 so a plain HTML form lands somewhere sensible instead of on a
      // blank 204 page.
      return reply.code(303).header("location", "/").send();
    },
  );
}
