# Atlas

Atlas is the club platform for universities: verified students, staff, and
recognised societies at participating institutions.

This repository contains three things that run together:

- the **marketing site** (`index.html`, `download.html`, `signin.html`),
- a **Phase 1 backend** (`server/`): sign-in and a scoped `/api/v1`,
- a **one-command demo** that runs both plus a Postgres database.

> **Status:** Phase 1. It runs end to end locally, but it is not deployed, and it
> has no real university identity provider configured yet. See
> [PLAN.md](PLAN.md) for the roadmap.

## Run the demo

### You need

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker
  Engine with Compose v2), **or** Node.js 20+ if you prefer not to use Docker.

Nothing else. There is no database to install and no credentials to obtain.

### With Docker (recommended)

From the repository root:

```sh
docker compose up --build -d --wait
```

That builds the app, starts Postgres, applies migrations, seeds two demo
universities, and waits until both services are healthy. Then open:

**<http://localhost:3000/>**

Prefer to watch the logs? Run `docker compose up --build` in the foreground
instead.

### Try it

1. The home page is the marketing site.
2. Choose **Sign in**, then **Continue with your university account**.
3. You land on a clearly labelled **fake identity provider** (because no real
   one is configured). Choose **Continue as Ada Lovelace**.
4. You arrive at `/app`, signed in as a student at **University A**, and see
   that campus's clubs.
5. Visit `/api/v1/me` or `/api/v1/clubs` to see the JSON the app uses.
6. Sign out, then sign in as **Bob** to see a different university's clubs. Each
   account sees only its own institution's data.

There are no passwords anywhere in this project. The demo accounts are:

| Email             | University   | Role in the demo              |
| ----------------- | ------------ | ----------------------------- |
| `ada@uni-a.edu`   | University A | Officer of Chess Society      |
| `grace@uni-a.edu` | University A | Member of Chess and Rowing    |
| `bob@uni-b.edu`   | University B | Officer of Debate Society     |

### Stop, reset, rebuild

```sh
docker compose logs -f app   # follow the server logs
docker compose down          # stop everything
docker compose down -v       # stop and delete the demo database
docker compose up --build    # rebuild after changing code
```

### Without Docker (Node 20+)

```sh
cd server
cp .env.example .env
npm install
npm run dev
```

Open **<http://localhost:3000/>**. `Ctrl+C` stops it. This mode uses embedded
Postgres (PGlite), so there is still no database server to install.

`npm run dev` applies migrations, seeds the demo data, and enables the fake
identity provider. Use `npm run seed` to seed explicitly, or `npm start` to run
without the fake provider (sign-in then returns `503` until real OIDC settings
are supplied).

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot connect to the Docker daemon` | Start Docker Desktop and run the command again. |
| `Bind for 0.0.0.0:3000 failed: port is already allocated` | Something else is using port 3000. Stop it, or change `ports` in `compose.yaml` to `"3001:3000"` **and** set `APP_BASE_URL: http://localhost:3001`, then open port 3001. |
| `docker compose` says the file is not found | Run the command from the repository root, where `compose.yaml` lives. |
| The page loads but sign-in says **not configured** | You are running `npm start` rather than `npm run dev`. The fake provider is only enabled by `npm run dev` or the compose file. |
| Sign-in says **University not supported** | That email's domain is not in the `institution` table. Use one of the demo accounts above, or add an institution row. |
| Changes do not appear in Docker | Rebuild with `docker compose up --build`. |
| I want a clean database | `docker compose down -v`, then start again. |
| Tests fail after changing the schema | Run `npm run migrate` in `server/`; never edit an applied migration, add a new one. |

### What the demo is — and is not

The compose stack is a **local demo**, not a deployment. It runs with
`NODE_ENV=development`, `DEV_MOCK_IDP=true`, and `SEED_DEMO_DATA=true`.

- The fake provider at `/dev-idp` verifies nothing. Clicking a demo account
  simply claims to be that person. It is only mounted when no real provider is
  configured, and the server **refuses to start** with it enabled in production.
- The seeded universities, clubs, and people are fake.
- Data lives in the `atlas-db` Docker volume.
- The project is intended for `localhost`. Do not deploy it as-is.

## What's in the repository

| Path | Purpose |
| --- | --- |
| `index.html` | Marketing overview: about, features, download link |
| `download.html` | Download page (its link is still a placeholder) |
| `signin.html` | Sign-in page; its button points at `/auth/login` |
| `style.css` | Theme tokens, layout, responsive rules |
| `script.js` | Theme toggle only; no token handling |
| `server/` | BFF and `/api/v1`: Fastify, TypeScript, Postgres |
| `server/Dockerfile` | Multi-stage image for the app |
| `compose.yaml` | App + Postgres, one command |
| `migrations/` | SQL schema, applied once in order |
| `docs/` | ERD, API contract, auth notes, Phase 1 plan |
| `PLAN.md` | How to build the web, iOS, and Android apps |
| `AGENTS.md` | Project constraints for agents and contributors |
| `LICENSE` | Project license |

## Configuration for a real university

Sign-in is OpenID Connect (Authorization Code flow with PKCE). To use a real
identity provider, put these in `server/.env` (see `server/.env.example`):

```sh
OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_CLIENT_ID=<application-client-id>
OIDC_CLIENT_SECRET=<client-secret>
SESSION_SECRET=<32 random bytes, base64>
APP_BASE_URL=http://localhost:3000
COOKIE_SECURE=false   # true once served over HTTPS
```

Register `http://localhost:3000/auth/callback` (or your deployed equivalent) as
the redirect URI with the provider. The `institution` table maps an email domain
to a campus; sign-in rejects domains that are not listed.

In a container, set `NODE_ENV=production`, provide the same values with
`COOKIE_SECURE=true`, and keep `SESSION_SECRET` long and random. The fake
provider and demo seeding are ignored in production.

## How sign-in works

1. `/auth/login` discovers the identity provider and redirects the browser there.
2. The university verifies the person on its own page.
3. `/auth/callback` checks the signed `state`, exchanges the code, and verifies
   the ID token's signature, issuer, audience, and nonce.
4. The server maps the verified email domain to an institution, creates an
   opaque session, and sets it in an `httpOnly`, `SameSite=Lax` cookie.

Atlas never sees or stores a password. No token ever reaches browser JavaScript.
Sessions are rows in Postgres, and only a SHA-256 hash of the token is stored.

## API (Phase 1)

All `/api/v1` routes require a session and scope every query to the session's
institution. An `institution_id` from a request body or query is never trusted.

| Endpoint | Purpose |
| --- | --- |
| `GET /auth/login` | Start sign-in (`503` with an explanation if unconfigured) |
| `GET /auth/callback` | Finish sign-in, set the session cookie |
| `GET /auth/me` | Current account and institution |
| `POST /auth/logout` | Revoke the session |
| `GET /api/v1/me` | Current account and institution |
| `GET /api/v1/clubs` | Active clubs for the caller's institution |
| `GET /api/v1/clubs/:id` | One club plus its members |
| `GET /healthz` | Liveness check |

`/app` is a server-rendered page. A React app is a later phase.

## Developing

```sh
cd server
npm run typecheck    # TypeScript, strict
npm test             # 38 tests
npm run build        # compile to server/dist
```

The tests cover PKCE, signed OIDC state (tampering and expiry), session
creation/expiry/revocation, `401`s without a session, full sign-in against the
fake provider, static file serving, and cross-institution scoping.

To check the production build locally:

```sh
cd server
npm run build
DATABASE_URL=memory:// SESSION_SECRET=... node dist/index.js
```

## The download link

The download button on `download.html` currently points at a **placeholder**:

```
https://example.com/atlas/download
```

When the real download URL is known, change the `href` on the
`<a class="download-button">` element in `download.html`. It is marked with a
`DOWNLOAD LINK` comment in the file.

## Static site only

To view just the five marketing files without the backend, run this from the
repository root:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Any static file server works. Opening
`index.html` directly from disk also works.

Sign-in needs the server, because it uses an `http(s)` redirect URI and an
`httpOnly` cookie.

## The interaction: theme toggle

The header has a single **theme toggle** button.

- On first visit, the page uses your operating system's colour preference.
- Pressing the button switches between light and dark. It works with a mouse and
  the keyboard: focus it with `Tab`, then press `Enter` or `Space`.
- The label and `aria-pressed` state update so screen readers announce the
  current theme.
- The choice is saved in `localStorage` and restored next time. If storage is
  blocked, the page still works; only the memory of the choice is lost.
- If no explicit choice has been made, the page follows later OS theme changes.

Theme colours are defined once as CSS custom properties at the top of
`style.css` and switched by a `data-theme` attribute on the `<html>` element.

## Accessibility and responsiveness

- Semantic elements throughout, headings in order, and a "Skip to content" link.
- Visible keyboard focus outlines; motion is reduced when the OS asks for it.
- A fluid, readable column and a self-reflowing feature grid, so the layout works
  from narrow phone widths (~360px) to wide desktop widths (~1440px+).

## License

See [LICENSE](LICENSE).
