# Atlas

A static marketing and sign-in site for Atlas, the app universities use to host
their clubs. Strictly university based: verified students, staff, and recognised
societies at participating institutions.

- **`index.html`** — overview: heading, short introduction, **About**, and
  **Features**, with a link through to the download page.
- **`download.html`** — the **download link**, how to get started, and who can
  use Atlas.
- **`signin.html`** — the **sign-in page** and entry point to the web app,
  using your university's single sign-on.
- All pages share a light/dark **theme toggle**.

Built with plain HTML, CSS, and JavaScript. No dependencies, no build step, no
CDN.

For how to build the actual web, iOS, and Android applications, see
**[PLAN.md](PLAN.md)**.

## Files

| File            | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `index.html`    | Overview page: About and Features                |
| `download.html` | Download page with the download link             |
| `signin.html`   | Sign-in page and web app entry point             |
| `style.css`     | Theme colors, layout, responsive rules           |
| `script.js`     | Theme toggle and OIDC sign-in                    |
| `server/`       | Phase 1 backend: BFF, `/auth`, `/api/v1`, tests  |
| `migrations/`   | SQL schema, applied in order                     |
| `docs/`         | ERD, API, auth, and Phase 1 notes                |
| `PLAN.md`       | How to build the web, iOS, and Android apps      |
| `AGENTS.md`     | Project constraints for agents and contributors  |
| `LICENSE`       | Project license                                  |

## The download link

The download button on `download.html` currently points at a **placeholder**:

```
https://example.com/atlas/download
```

When the real download URL is known, change the `href` on the
`<a class="download-button">` element in `download.html`. It is marked with a
`DOWNLOAD LINK` comment in the file.

## Run locally

Everything here is static, so all you need is a local web server. Pick one of
the options below and run it from the project directory.

### Option 1: Python 3 (usually already installed)

```sh
cd /Users/rickycui/github/openclaw
python3 -m http.server 8000
```

Then open <http://localhost:8000/> in your browser.

Stop the server with `Ctrl+C`.

### Option 2: Any static file server

Any equivalent tool works, as long as it serves this directory on localhost.
For example, with `npx` (only if Node.js is already installed — this downloads
nothing into the project):

```sh
npx --yes serve . -l 8000
```

Then open <http://localhost:8000/>.

### Option 3: Open the file directly

Double-click `index.html`, or open it from your browser, to view it as a
`file://` URL. This works, but a real server (Option 1 or 2) is recommended so
the page behaves the same as it would when hosted.

> Note: this project is intended for `localhost` only. Do not deploy it.
>
> The sign-in page needs a real server (Option 1 or 2), because OIDC redirects
> use an `http(s)` redirect URI. It will not work from a `file://` URL.

## Sign-in (university single sign-on)

`signin.html` is the web app's entry point. It uses **OpenID Connect,
Authorization Code flow with PKCE**:

1. The visitor presses **Continue with your university account**.
2. The browser is sent to the university's own sign-in page.
3. The university verifies the person and sends them back with a code.
4. Atlas exchanges the code for tokens, reads the verified email, and (if you
   configured a domain allow-list) requires it to be a university address.

**Atlas never sees or stores a password.** There is no password field anywhere
in this project.

### It is inert until you configure it

The flow needs two values from your university's identity provider. They live in
the `CONFIG` block near the top of the sign-in section in `script.js`:

```js
var CONFIG = {
  issuer: "",   // e.g. "https://login.microsoftonline.com/<tenant-id>/v2.0"
  clientId: "", // the application (client) ID from your provider
  scopes: "openid profile email",
  allowedEmailDomains: [], // e.g. ["student.ox.ac.uk"] to enforce university-only
};
```

Until `issuer` and `clientId` are filled in, the page displays a plain warning
and the button explains that sign-in is not configured. It does not fake a
signed-in state.

You must also register the redirect URI with your provider. It is the exact URL
of the sign-in page, for example `http://localhost:8000/signin.html`.

> Prototype caveat: because this is a browser-only client, it keeps tokens in
> `sessionStorage`. For production with real student data, put a small backend
> in front so tokens live in `httpOnly` cookies. See `PLAN.md`, "Backend for
> frontend".

## Backend (Phase 1)

The static site above is the marketing surface. The signed-in product needs a
server, so `server/` contains a small **BFF (backend for frontend)** and a
read-only `/api/v1`. It is deliberately separate from the static files and has
its own `package.json`.

What it does today:

- **Sign-in via the university IdP** (OIDC Authorization Code + PKCE). The
  server verifies the ID token signature, issuer, audience, and nonce, then
  issues an **opaque session token** in an `httpOnly` cookie. No token ever
  reaches browser JavaScript, and no password is ever handled.
- **Institution scoping in SQL.** The caller's `institution_id` comes only from
  the session, never from the request.
- **A server-rendered `/app`** page (no client JS yet) and these endpoints:

| Endpoint            | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `GET /auth/login`   | Start sign-in (503 with an explanation if unconfigured) |
| `GET /auth/callback`| Finish sign-in, set the session cookie          |
| `GET /auth/me`      | Current account and institution                 |
| `POST /auth/logout` | Revoke the session                              |
| `GET /api/v1/me`    | Current account and institution                 |
| `GET /api/v1/clubs` | Active clubs for the caller's institution       |
| `GET /api/v1/clubs/:id` | One club plus its members                   |
| `GET /healthz`      | Liveness check                                  |

### Run it locally

```sh
cd server
cp .env.example .env
npm install
npm run migrate
npm run dev
```

Then open <http://localhost:3000/>. `Ctrl+C` stops it.

Local runs use **embedded Postgres (PGlite)**, so there is no database server to
install; data is kept in `server/data/` (git-ignored). Production can point
`DATABASE_URL` at a normal `postgres://` URL and the same SQL applies.

Without `OIDC_ISSUER` and `OIDC_CLIENT_ID`, the server still starts and
`/auth/login` answers `503` with a plain "not configured" page. It never fakes a
signed-in state. `/app` and the API return `401` until you sign in.

### Checks

```sh
cd server
npm run typecheck
npm test
```

The tests cover PKCE, signed OIDC state (tampering and expiry), session
creation/expiry/revocation, `401`s without a session, and cross-institution
scoping for clubs.

### Decisions and limits

- **Fastify + TypeScript (strict)** on Node 20+.
- **Sessions are rows in Postgres**, storing only a SHA-256 hash of the token.
- **Migrations live in `migrations/`** and are applied once, in order, each in a
  transaction. `db/schema.sql` points at them.
- `/app` is a server-rendered placeholder. The React app is a later phase, and
  the marketing `signin.html` will point at `/auth/login` once the static site
  and the BFF are served from one origin.

See `docs/PHASE1.md` for scope and acceptance criteria, `docs/API.md` for the
contract, `docs/ERD.md` for the schema, and `docs/AUTH.md` for the sign-in
design.

## The interaction: theme toggle

The header has a single **theme toggle** button.

- On first visit, the page uses your operating system's color preference.
- Pressing the button switches between the light and dark themes. It works with
  a mouse and with the keyboard: focus it with `Tab`, then press `Enter` or
  `Space`.
- The button's label and `aria-pressed` state update to match, so screen
  readers announce the current theme.
- Your choice is saved in `localStorage`, so it is remembered on your next
  visit. If storage is blocked, the page still works; only the memory of your
  choice is lost.
- If you have not made an explicit choice, the page follows later changes to
  your OS theme.

Theme colors are defined once as CSS custom properties at the top of
`style.css` and switched by a `data-theme` attribute on the `<html>` element.

## Accessibility and responsiveness notes

- Semantic elements throughout, headings in order, and a "Skip to content" link.
- Visible keyboard focus outlines; motion is reduced when the OS asks for it.
- Layout uses a fluid, readable column and a self-reflowing feature grid, so it
  works at narrow (~360px) and wide (~1440px+) widths.
