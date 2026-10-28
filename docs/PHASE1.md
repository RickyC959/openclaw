# Phase 1 — BFF + SSO (detailed plan)

Goal (from PLAN.md): **A real student signs in on the web and `/api/v1/me` returns them.**

This doc breaks Phase 1 into decisions, tasks, and acceptance criteria.

---

## 0. Status

**Built:** T1–T5, T7 (headers, rate limiting, cookie flags, Origin check,
scoping), T8 (unit + integration + full-flow tests against a fake IdP), T9 in
part (README). The static marketing site is now served by the same Fastify app,
and `signin.html` links to `/auth/login`.

**Implemented differently from the table below:**

- **D3 — raw SQL, not an ORM.** The schema is small and explicit, so a tiny
  `Db` adapter (`query`, `exec`) over `pg` / PGlite keeps the SQL readable.
- **Local dev and tests use embedded Postgres (PGlite)**, so nothing external
  needs installing; production and the container use a `postgres://` URL with
  the same SQL.
- **D6 — SameSite=Lax + Origin check** for now. There are no
  cookie-authenticated writes yet, so a double-submit token is deferred until
  the first one (membership join/leave).
- **D9 / T6 — server-rendered `/app`, no client JS yet.** The React app is
  deferred; Phase 1 only needs to prove sign-in and scoped reads.
- **A fake IdP (`/dev-idp`) and seed data** make the flow runnable locally
  without a university. Both are development-only and refused in production.

**Container:** `server/Dockerfile` builds the TypeScript server and runs the
compiled output; `compose.yaml` runs it with Postgres. `docker compose up
--build` is the one-command demo.

**Still open:** D7 (pilot university and its IdP), D11 (hosting and data
residency), and the real download URL.

---

## 1. Decisions to make before we write code

| # | Decision | Options | Recommendation | Why |
|---|----------|---------|----------------|-----|
| D1 | **Backend framework** | Fastify (TS), Hono (TS/JS), Express, Nest | **Fastify + TypeScript** | Fast, schema validation via JSON Schema, first-class TS, tiny surface |
| D2 | **Database** | Postgres (managed: RDS/Cloud SQL/Neon/Supabase) | **Postgres, managed** | Schema already in `db/schema.sql`; managed avoids ops work |
| D3 | **DB access layer** | Drizzle, Prisma, Kysely, raw `pg` | **Drizzle or Kysely** | Typed SQL, migrations, no ORM magic; `pg` alone is fine for pilot |
| D4 | **Session store** | Postgres table (already in schema), Redis, in-memory | **Postgres `session` table** | One less service; sessions survive restarts; can move to Redis later |
| D5 | **Session cookie** | Signed stateless JWT cookie vs opaque random token | **Opaque random token** stored in DB | Lets us revoke a session server-side (logout-all, breach response) |
| D6 | **CSRF strategy** | SameSite=Lax + double-submit token | **Both** (belt and braces) | SameSite alone is not a complete defence for POST routes |
| D7 | **Pilot institution** | One pilot university; its IdP (Entra / Google / Shibboleth) | **To be decided** | Determines whether we need a SAML bridge in Phase 1 |
| D8 | **SAML support in Phase 1** | Yes / No (defer) | **No — OIDC only** | Add SAML bridge only when a needed university requires it |
| D9 | **Frontend framework for `/app`** | React (Vite), Vue, Svelte, plain HTMX | **React + Vite (TS)** | RN later shares types; HTMX is simplest but less standard for SPA |
| D10 | **Where `/app` lives** | Same origin as marketing site / separate subdomain | **Same origin, path `/app`** | Simpler cookies; avoids CORS; can split later |
| D11 | **Hosting (pilot)** | Fly.io, Railway, Render, VPS, university-hosted | **To be decided** | Must satisfy data-residency / DPA requirements |
| D12 | **Email verification** | Trust IdP claims vs re-verify | **Trust IdP email + sub** | IdP already verified the person; re-verification adds no trust |

**Open questions for you** (affects D1/D2/D3/D7/D11):
- Which university is the pilot, and which IdP does it use?
- Do you already have a hosting preference or a cloud account?
- Do you want TypeScript everywhere (recommended) or plain JS?

---

## 2. Task breakdown

### T1 — Backend bootstrap
- Init `server/` with Fastify + TypeScript.
- `.env.example` with `DATABASE_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`,
  `OIDC_CLIENT_SECRET`, `SESSION_COOKIE_SECRET`, `APP_BASE_URL`.
- `.gitignore` already ignores `.env`; add `server/node_modules`, build output.
- Health endpoint `GET /healthz`.

### T2 — Database + migrations
- Add a migration runner (e.g. `drizzle-kit` or `node-pg-migrate`).
- `001_init.sql` already exists; add `002_indexes.sql` (institution_id on
  membership/event via club, email lookups).
- Connection pooling via `pg` (managed Postgres).
- Seed script for a pilot `institution` row (slug, domain, IdP issuer, client id).

### T3 — Session layer
- `session` table (opaque token hash, account_id, expiry, user_agent, ip).
- Middleware: read `atlas_session` cookie → look up session → attach
  `req.account` + `req.institution`; 401 JSON if missing/expired.
- Session rotation on login (new token each login), sliding expiry optional.

### T4 — BFF auth routes
- `GET /auth/login?inst=<slug>` — discover IdP, build authorize URL with PKCE,
  store `state`+`verifier` server-side (signed or in DB), redirect.
- `GET /auth/callback?code&state` — verify state, exchange code, parse
  `id_token` claims (email, sub, name), resolve institution by email domain or
  `inst` param, upsert `account`, create session, set cookie, redirect `/app`.
- `GET /auth/me` — returns account+institution JSON (used by frontend).
- `POST /auth/logout` — delete session row, clear cookie.

### T5 — API v1 (read paths first)
- `GET /api/v1/me` (alias or same as `/auth/me` — pick one, use consistently).
- `GET /api/v1/clubs` — institution-scoped list (active only).
- `GET /api/v1/clubs/:id` — club + member list (scoped; 404 if other institution).
- Wire DB queries with Drizzle/Kysely; every query filters by institution_id.

### T6 — Frontend `/app` scaffold
- React + Vite in `frontend/`, built to `dist/` served by Fastify at `/app/*`.
- Routes: `/app` (dashboard shell), `/app/login` (button to `/auth/login`),
  `/app/clubs`, `/app/clubs/:id`.
- Uses `/api/v1/me` on load; if 401, shows "Sign in" button.
- Reuse design tokens from `style.css` (copy or shared token file).

### T7 — Security hardening (pilot checklist)
- Helmet/CSP headers, CORS locked to own origin, rate limit `/auth/*`.
- Secrets never logged; error responses generic.
- Cookie: `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- CSRF double-submit token on POST routes.
- Basic audit log (login, logout, session create/destroy).

### T8 — Tests
- Unit: PKCE verifier/challenge, state validation, institution resolution,
  session expiry logic.
- Integration: auth callback happy path (mock IdP), `/api/v1/me` scoped queries,
  club 404 for cross-institution.
- E2E smoke: login → me → clubs list (with a local mock IdP).

### T9 — Docs & runbook
- Update `docs/AUTH.md` with the concrete endpoints built.
- Add `docs/RUNBOOK.md`: how to run locally, seed a pilot institution, configure
  IdP redirect URIs.
- `README` update: run server + frontend together.

---

## 3. Acceptance criteria (Phase 1 "done when")

1. A real student at the pilot university can sign in with their university
   credentials through the BFF.
2. A session cookie is set; `/api/v1/me` returns their account + institution.
3. `/api/v1/clubs` returns only clubs belonging to their institution.
4. Signing out clears the session; `/api/v1/me` then returns 401.
5. Tokens never appear in browser JS; only the httpOnly cookie is used.
6. All secrets are in `.env`, never in git.
7. The marketing site (`index.html`, `download.html`, `signin.html`) still works
   unchanged (or is intentionally migrated — decide in D10).

---

## 4. Risks / notes

- **Pilot IdP unknown** — biggest blocker for T4; affects D7/D8.
- **SAML** — if pilot uses Shibboleth-only, we must either add a SAML bridge
  (extra work) or pick a pilot with an OIDC-capable IdP.
- **Data residency** — hosting choice (D11) may be constrained by the
  university's DPA; confirm before choosing.
- **Frontend hosting** — simplest is Fastify serving `frontend/dist`; a SPA
  fallback route is needed for client-side routing.

---

## 5. Suggested order of execution

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9

T1–T4 deliver a working sign-in; T5 delivers the first API; T6 makes it usable;
T7–T9 harden and document.
