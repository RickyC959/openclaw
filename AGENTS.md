# AGENTS.md

Project constraints for Atlas: a static marketing site plus a Phase 1 backend
(BFF + API). The static site stays tiny and dependency-free; the backend is a
separate, conventional Node service.

## Scope

- **`/` (marketing site):** `index.html`, `download.html`, `signin.html`,
  `style.css`, `script.js`.
- **`server/`:** the BFF and `/api/v1` (TypeScript, Fastify, Postgres).
- **`frontend/`:** the signed-in web app (later phase).
- **`db/`, `migrations/`, `docs/`:** schema, migrations, and written plans.

The rules below marked *(static)* apply only to the marketing site. The
constraints marked *(backend)* apply to `server/` and `frontend/`.

## Static site constraints

- **Five source files only:** `index.html`, `download.html`, `signin.html`,
  `style.css`, `script.js`. Do not add more source files without an explicit
  request.
- **No dependencies.** No package manager, no build step, no bundler. Do not
  install packages or add a `package.json` inside the site root.
- **No CDNs or remote assets.** No hosted fonts, CSS, JS, images, or analytics.
  Everything must work offline from the local files. Two deliberate exceptions:
  the outbound **download link** on `download.html`, and the **OIDC
  requests** the sign-in page makes to the university identity provider.
- **Never handle passwords.** Sign-in is delegated to the university's identity
  provider (OIDC Authorization Code + PKCE). Do not add password fields, do not
  log tokens, and never put credentials in `localStorage`.
- **Sign-in must not pretend.** If the identity provider is not configured, the
  page says so. Never fabricate a signed-in state or fake credentials.
- **University only.** Atlas is for university clubs. All copy must stay
  strictly campus-scoped: verified students, staff, and recognised societies at
  participating institutions. Do not describe private, public, or
  non-university communities.
- **Semantic HTML.** Use real elements for real jobs (`header`, `main`,
  `section`, `button`, `ul`/`li`, headings in order). Use ARIA only to add
  meaning that HTML does not already carry.
- **Accessible by default.** The page must be fully usable with a keyboard
  (visible focus, logical tab order, Enter/Space activation), and text and
  controls must meet contrast expectations in both themes.
- **Responsive.** Must work from narrow phone widths (~360px) up to wide
  desktop widths (~1440px+). Prefer fluid layout over many media queries.
- **Readable code.** Comment intent, not syntax. Keep the script small, plain,
  and defensive; no frameworks, no transpiling, no modern syntax that needs a
  build step.
- **Local only.** Serve on `localhost` for development. Do not deploy, host, or
  publish anywhere.
- **Do not commit, push, or install anything** unless the human explicitly asks.
- **Keep all work inside this project directory.**

## Backend constraints

- **TypeScript, strict.** No `any` in new code without a comment explaining why.
- **Fastify + Postgres.** Use the existing schema in `migrations/`. Do not add
  a second database or a different framework without asking.
- **Local dev must not require external services.** Local runs use embedded
  Postgres (PGlite) through the same SQL; production uses a `postgres://` URL.
- **Sessions are opaque tokens in Postgres**, sent only as `httpOnly`,
  `Secure`, `SameSite=Lax` cookies. Tokens never appear in browser JS.
- **Never handle passwords.** Identity comes from the university IdP (OIDC).
  Verify the ID token signature and nonce on the server.
- **Institution scoping is enforced in SQL.** Never trust an `institution_id`
  from a request body or query. Derive it from the session.
- **Secrets live in `.env`** and are never committed. `.env.example` documents
  every required variable with a fake value.
- **Migrations are additive.** Never edit an applied migration; add a new one.
- **Tests before claims.** `npm test` and `npm run typecheck` must pass before
  saying a backend task is done.

## Structure

```
index.html      Overview page: heading, intro, About, Features, download link
download.html   Download page: the download button, install steps, eligibility
signin.html     Sign-in page: the web app entry point
style.css       Theme tokens, layout, responsive rules
script.js       Theme toggle + OIDC sign-in
README.md       What it is and how to run it locally
PLAN.md         How to build the web, iOS, and Android apps
LICENSE         Project license
```

## Notes for agents

- The interaction is the light/dark **theme toggle**, a single `<button>` in the
  header of both pages. Logic lives in `script.js`; see that file's header
  comment.
- Theme colors live in CSS custom properties at the top of `style.css`. Change
  colors there, not at the point of use.
- `localStorage` is treated as optional. Never let a blocked or unavailable
  storage API break the page.
- The download URL in `download.html` is a **placeholder** pointing at
  `example.com`. Replace the `href` in the `DOWNLOAD LINK` comment block when
  the real URL is known. Do not invent a real-looking URL.
- Both pages share the same header and footer markup. Keep them in sync.
