# PLAN.md — building Atlas: web app, iOS, and Android

This is a plan, not a promise about dates. It describes how to get from the
static marketing site in this repo to a real product with a web app, an iOS
app, and an Android app for university clubs.

## Where we are now

This repo is a **static, dependency-free site**: `index.html`, `download.html`,
`signin.html`, `style.css`, `script.js`. It can:

- explain the product (Home),
- link out to a download URL (Download),
- show a sign-in gate that performs a real **OIDC Authorization Code + PKCE**
  redirect and token exchange.

It cannot, and does not pretend to:

- store, create, or manage user accounts;
- hold any club, event, or membership data;
- list clubs, or do anything a backend would do.

The sign-in page is **inert until configured** with your identity provider's
`issuer` and `client_id` (see `script.js`, the `CONFIG` block). With those
blank, the page says so plainly. That is deliberate.

> Security note: as a public browser client, this page keeps tokens in
> `sessionStorage`. That is fine for a prototype, but for real student data the
> tokens should live in `httpOnly` cookies issued by a small backend, so that a
> cross-site scripting bug cannot read them. See "Backend for frontend" below.

## Target architecture

```
   iOS app  ─┐
             │
 Android app ─┼──►  Atlas API (HTTPS/JSON)  ──►  Postgres
             │            │
  Web app  ──┘            └──►  University IdP (OIDC: Entra / Google / Shibboleth)
```

One backend, three clients. The clients are thin: they render data and call the
same API. This is what keeps "web app + iOS + Android" affordable.

- **Backend for frontend (BFF).** A small server that holds the OIDC client
  secret, exchanges the authorization code, and issues a first-party session
  cookie (`httpOnly`, `Secure`, `SameSite=Lax`). No tokens in browser JS.
- **API.** JSON over HTTPS, versioned (`/api/v1/...`), same auth for all clients.
- **Database.** Postgres. Start in one region close to your universities.

### Vocabulary (keeps the data model honest)

- **Institution** — a university. Everything is scoped to one.
- **Account** — a person, tied to exactly one institution and one verified email.
- **Club** — belongs to an institution. Has members and officers.
- **Membership** — an account's relationship to a club (member, officer, etc.).
- **Event** — belongs to a club. Has a time, place, and sign-ups.

The university-only rule becomes a **database constraint, not a marketing
sentence**: a club's `institution_id` must equal the creating account's
`institution_id`, and membership must be same-institution.

## Authentication: university SSO

Use **OpenID Connect** against the university's identity provider wherever
possible. Most universities are on one of:

| Provider | Typical fit | Notes |
| --- | --- | --- |
| Microsoft Entra ID | Most large universities | OIDC, multi-tenant option |
| Google Workspace for Education | Google-based campuses | OIDC |
| Shibboleth / SAML 2.0 | Older teaching-focused institutions | Not OIDC; needs a SAML bridge |

Plan for OIDC first, and add a SAML bridge only when a university you need has
no OIDC. Do **not** build your own password database: it transfers a pile of
security and support work to you, and it makes the "verified university email"
claim harder to prove.

Regardless of provider:

- Verify the email domain against the institution you think they belong to,
  and store the institution on the account at first sign-in.
- Never trust a client-supplied institution. The server derives it from the
  verified token.
- Support at most one institution per account initially. Multi-institution
  people (exchange students, shared staff) are a known edge case — decide later,
  don't design around it on day one.

## Backend for frontend

Smallest useful shape:

- `GET /auth/login` → redirect to the institution's IdP.
- `GET /auth/callback` → exchange code, set session cookie, redirect to `/app`.
- `GET /api/v1/me` → current account + institution.
- `POST /auth/logout` → clear cookie, end IdP session.
- Everything else under `/api/v1/`.

Rules: secrets only on the server; cookies `httpOnly` + `Secure`; CSRF token on
state-changing requests; rate-limit the auth routes.

## The web app

- Reuse the shared design tokens in `style.css` so the web app matches the
  marketing site.
- Recommend a small React or Vue app for the signed-in area only — the
  marketing pages stay static, because they don't need a framework and are
  cheap to host.
- Server-render the first paint if you can: faster, and easier to make
  accessible. If not, ship a plain HTML shell that works before JS loads.
- Route structure: `/app` (dashboard), `/app/clubs`, `/app/clubs/:id`,
  `/app/events`, `/app/profile`.
- Reuse the accessibility habits already in this repo: real buttons, visible
  focus, `aria-current`, labels on every field, no colour-only meaning.

## The mobile apps: cross-platform

**Recommendation: one React Native (or Flutter) codebase for iOS and Android.**
For a small team building forms, lists, and push notifications, it is roughly
half the work of two native apps, and the UI here is not unusual enough to
justify Swift and Kotlin separately.

- **React Native** if your team already writes JavaScript/TypeScript and you
  want to share types with the web app.
- **Flutter** if you want the most consistent rendering across platforms and
  are happy with Dart.

Either way, budget for a **native shell**: push notifications, deep links, and
store metadata are platform-specific even in cross-platform code.

Do not build three codebases. Share the API and the design tokens; share the
auth flow by using the same OIDC provider with platform-appropriate redirect
URIs (custom URL scheme + universal/app links).

## App store reality check

Ships to both stores means work that is not code:

- a developer account on each store, with fees that change over time — check
  the current amounts before you budget;
- privacy disclosures, including what student data you collect and why;
- review guidelines for apps that require an institutional login: both stores
  expect reviewers to be able to sign in, so plan a demo account or a
  documented review path;
- a data-deletion path, which both stores now expect.

> Store fees, review rules, and privacy requirements change often. Verify them
> against Apple's and Google's current documentation before committing to a
> launch date.

## Compliance and trust

Handling student data means real obligations, and universities will ask:

- **FERPA** (US) — student records are protected; you are likely a "school
  official" under contract with the institution.
- **GDPR / UK GDPR** — if any EU/UK students are involved: lawful basis,
  retention limits, export and deletion.
- **Data processing agreement** with each university. In practice this, not
  code, is the slow part of onboarding a new institution.
- Data minimisation: clubs need names and emails. They do not need student ID
  numbers, addresses, or dates of birth. Do not collect them.

Based on real guidance from universities (Cambridge, Oxford, UCL, University of
Suffolk), you'll also need to plan for:
- **Privacy notice** per institution (template exists at many unis; yours must
  state purposes, lawful basis, retention, rights, and who data is shared with).
- **Subject access requests (SARs)** — a person may ask for their data at any
  time; have a process to recognise and respond within the required timeframe.
- **Data breaches** — need to log, contain, notify the university and (where
  required) the regulator without undue delay.
- **Processors** — if using a third-party (email, hosting, analytics), have a
  written processing agreement. Don't share member lists with third parties
  without explicit consent.
- **Committee turnover** — accounts/permissions must expire when officers change.
  Oxford, for example, resets access and expects credentials rotated on handover.
- **Data residency** — often universities ask for storage in their region (e.g.
  US universities often expect US residency); verify at pilot stage.
- **Mailing lists** — BCC recipients, easy unsubscribe, don't expose member
  emails to others, and archive/monitor public lists.
- **Records of processing** and data retention schedule agreed with the
  university. Remove data when people stop being members.

## Real-world context: what others do

These are expectations the market sets (useful when talking to universities):

| Feature | Notes (from real platforms) |
|---|---|
| Native mobile apps | iOS and Android branded apps are expected now (StudentLink+, ACUI PRO/Rubric). A responsive site alone is often seen as insufficient. |
| SSO federation | Support SAML 2.0, Shibboleth, InCommon, Entra ID; some unis want eduGAIN. Oxford has its own `@studentclubs.ox.ac.uk` model. |
| Institution-scoped everything | Everything must be scoped to one institution. Roster management, approvals, compliance, events — all filtered by institution. |
| Club self-service | Officers should manage their own pages, rosters, events, communications, documents; but with strict permissions. |
| Compliance automation | Track training, onboarding milestones, annual re-registration, forms, approvals — many competitors do this. |
| Commerce | Ticketing/merch is common (Rubric charges transaction fees: typically tiered by volume; pricing is quote-based for many vendors — don't assume fixed prices). |
| Reporting | Dashboards, co-curricular records/transcripts, engagement metrics. |
| Integrations | SIS (e.g. Banner), housing, campus card, email/SMS, payment gateways, API/webhooks. |
| Security posture | SOC 2 Type II often requested; ISO 27001 seen. Data encrypted at rest/in transit. Audit logs. |
| Exportability | Many vendors emphasise data is owned by the institution and self-exportable at any time (important for buyouts). | 

Note on pricing: ACUI PRO/Rubric, Pathify, MSL don't consistently publish fixed list prices — they quote based on enrollment, modules, add-ons. Transaction fees apply if you take payments (e.g. tiered % + cents). Treat pricing as something to validate with a demo for your pilot.

## Phased milestones

| Phase | Goal | Done when |
| --- | --- | --- |
| 0 | This static site | Home, Download, sign-in gate all work; sign-in configured for one institution |
| 1 | BFF + SSO | A real student signs in on the web and `/api/v1/me` returns them |
| 2 | Clubs read path | Web app lists clubs and events for one institution |
| 3 | Membership | Join/leave a club, officers see members |
| 4 | Events | Create events, RSVP, see who is coming |
| 5 | Mobile apps | Same features in one cross-platform app, on both stores (or TestFlight/internal track first) |
| 6 | Second university | Onboard a second institution end-to-end, which will find every place you assumed one university |

Phase 6 is the real test. A product that works for two institutions works for
twenty; a product that only ever ran at one usually does not.

## Decisions needed before Phase 1

1. Which identity provider does your first university use? (Entra, Google,
   Shibboleth — determines whether you need a SAML bridge.)
2. Who owns the backend: you, or a partner? Language and hosting choice follow.
3. Which institution is the pilot, and who signs the data processing agreement?
4. React Native or Flutter, based on your team's existing skills.
5. Do you need multi-institution accounts? (Recommended: no, at first.)
6. Data residency & compliance: US/UK/EU? FERPA/GDPR? Need SOC 2 for pilot? What does the uni's DPA require?
7. Payments: will you take payments now? If yes, payment gateway, PCI scope, and transaction fee model.
8. SSO scope: just web app, or mobile apps too? (affects redirect URIs, universal links, custom schemes)
9. Export/retention policy: minimum viable retention, SAR/breach process owners, privacy notice template per institution.

## Risks

- **University procurement is slow.** Technical readiness is rarely the
  blocker; the agreement is. Start it early, in parallel with Phase 1.
- **Growth beyond one campus breaks assumptions.** Institution-scoped tests
  should be written from Phase 2, not added in Phase 6.
- **Auth drift.** Three clients with three slightly different auth flows is a
  bug farm. Keep the flow in one spec and test it per client.
- **Tokens in the browser.** Solved by the BFF; do it before Phase 2.
- **Compliance burden.** SARs, breaches, DPAs, privacy notices take time and
  need named owners (IT + legal). Don't treat them as "later".
- **Committee turnover.** Access revocation/handover is a common source of
  mistakes; design role expiry and forced re-auth on role change.
- **Integration creep.** SIS/Banner, housing, campus card integrations look
  small but often have lengthy security reviews. Only add if pilot requires.

## What this repo should and should not grow into

Keep this repo as the **marketing site plus the sign-in gate** — it should stay
static, fast, and dependency-free for as long as possible. The application
itself belongs in its own repository with its own build, so that a backend
outage or a dependency upgrade never risks the page that explains the product.
