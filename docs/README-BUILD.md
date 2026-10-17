Build structure (starting Phase 1: BFF + API)

- server/  Backend (BFF + REST API). Start minimal (Express/fastify/Hono etc). Keep simple; will need OIDC code exchange, sessions (httpOnly), CORS, rate limiting.
- db/      Database schema + migrations (Postgres). Track institution, account, club, membership, event.
- migrations/ SQL migrations or migration runner config
- frontend/ Signed-in web app (React/Vue/Svelte). Keep marketing site separate (this repo stays as-is or we can move marketing).
- docs/    API spec, auth flow diagrams, ERD, onboarding checklist

Notes:
- Keep secrets out of git (.env)
- BFF handles OIDC client secret and sets httpOnly session cookie
- API is under /api/v1, auth-required routes check session
- Same API consumed by web + mobile later

Next steps (incremental):
1. Choose backend framework (recommend fastify + ts-node or hono + node). Keep minimal deps.
2. Define schema in db/schema.sql + migrations
3. Implement BFF auth routes (/auth/login, /auth/callback, /auth/logout, /auth/me)
4. Add /api/v1/me and basic read endpoints
5. Scaffold frontend app that calls API

Constraints to remember:
- Don't break existing static site (index/download/signin)
- Tokens never in JS (BFF cookie)
- Institution-scoped by default
