import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { AppConfig } from "../config.js";
import { createCodeChallenge, randomToken } from "../auth/pkce.js";
import { escapeHtml, page } from "../html.js";

/**
 * A deliberately fake OpenID Provider, for local development only.
 *
 * It exists so the whole sign-in flow can be exercised without a university:
 * discovery, authorize, PKCE verification, token exchange, and a signed ID
 * token with a real nonce. The BFF code that talks to it is the same code that
 * will talk to a real IdP, so this tests the real path.
 *
 * It is mounted only when DEV_MOCK_IDP=true and no real provider is configured.
 * It authenticates nobody: pressing a demo account button simply claims to be
 * that person. Never enable it in production (loadConfig refuses to).
 */

export const MOCK_IDP_PREFIX = "/dev-idp";

export interface DemoAccount {
  email: string;
  name: string;
  sub: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "ada@uni-a.edu", name: "Ada Lovelace", sub: "demo-ada" },
  { email: "grace@uni-a.edu", name: "Grace Hopper", sub: "demo-grace" },
  { email: "bob@uni-b.edu", name: "Bob Builder", sub: "demo-bob" },
];

interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  nonce: string;
  codeChallenge: string;
  expiresAt: number;
}

const CODE_TTL_MS = 5 * 60 * 1000;

function singleValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formField(
  request: FastifyRequest,
  name: string,
): string {
  const body = request.body as Record<string, unknown> | undefined;
  const fromBody = body ? body[name] : undefined;
  const fromQuery = (request.query as Record<string, unknown>)[name];
  return singleValue(fromBody ?? fromQuery);
}

export async function registerMockIdp(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  const origin = new URL(config.appBaseUrl).origin;
  const issuer = `${config.appBaseUrl}${MOCK_IDP_PREFIX}`;

  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const kid = "atlas-dev-key";
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    kid,
    alg: "RS256",
    use: "sig",
  };

  const pending = new Map<string, PendingAuthorization>();
  // Email chosen at the authorize step, kept alongside the pending code.
  const pendingEmail = new Map<string, string>();

  // Form posts from the mock's own sign-in page.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );

  app.get(`${MOCK_IDP_PREFIX}/.well-known/openid-configuration`, async () => ({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "profile", "email"],
  }));

  app.get(`${MOCK_IDP_PREFIX}/jwks`, async () => ({ keys: [publicJwk] }));

  function startAuthorization(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const clientId = formField(request, "client_id");
    const redirectUri = formField(request, "redirect_uri");
    const nonce = formField(request, "nonce");
    const codeChallenge = formField(request, "code_challenge");
    const email = formField(request, "email");

    if (!clientId || clientId !== config.oidc?.clientId) {
      return reply.code(400).type("text/plain").send("Unknown client_id.");
    }

    let redirect: URL;
    try {
      redirect = new URL(redirectUri);
    } catch {
      return reply.code(400).type("text/plain").send("Invalid redirect_uri.");
    }

    // Refuse to bounce anywhere but this app.
    if (redirect.origin !== origin) {
      return reply
        .code(400)
        .type("text/plain")
        .send("redirect_uri must stay on this origin.");
    }

    if (!codeChallenge) {
      return reply
        .code(400)
        .type("text/plain")
        .send("A PKCE code_challenge is required.");
    }

    const code = randomToken(24);
    pending.set(code, {
      clientId,
      redirectUri,
      nonce,
      codeChallenge,
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    redirect.searchParams.set("code", code);
    if (formField(request, "state")) {
      redirect.searchParams.set("state", formField(request, "state"));
    }

    // An empty choice means "the first demo account", which makes the flow
    // work even if the form is submitted without a button value.
    pendingEmail.set(
      code,
      (email || DEMO_ACCOUNTS[0]!.email).trim().toLowerCase(),
    );

    return reply.redirect(redirect.toString());
  }

  app.get(`${MOCK_IDP_PREFIX}/authorize`, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;

    if (!query.client_id || !query.redirect_uri || !query.code_challenge) {
      return reply
        .code(400)
        .type("text/plain")
        .send("Missing client_id, redirect_uri, or code_challenge.");
    }

    const hidden = (name: string): string =>
      `<input type="hidden" name="${name}" value="${escapeHtml(query[name] ?? "")}">`;

    const buttons = DEMO_ACCOUNTS.map(
      (account) =>
        `<button type="submit" name="email" value="${escapeHtml(
          account.email,
        )}">Continue as ${escapeHtml(account.name)} <span class="muted">(${escapeHtml(
          account.email,
        )})</span></button>`,
    ).join("\n");

    return reply.type("text/html").send(
      page(
        "Development sign-in",
        `<h1>Development sign-in</h1>
         <div class="box">
           <p><strong>This is a fake identity provider.</strong> It exists so Atlas
           can be run locally without a university. It verifies nothing, and it is
           only mounted in development.</p>
         </div>

         <h2>Choose a demo account</h2>
         <form method="post" action="${MOCK_IDP_PREFIX}/authorize">
           ${hidden("client_id")}
           ${hidden("redirect_uri")}
           ${hidden("nonce")}
           ${hidden("code_challenge")}
           ${hidden("state")}
           ${hidden("scope")}
           ${buttons}
         </form>

         <h2>Or type any email</h2>
         <p class="muted">Useful for seeing what happens to an unsupported domain.</p>
         <form method="post" action="${MOCK_IDP_PREFIX}/authorize">
           ${hidden("client_id")}
           ${hidden("redirect_uri")}
           ${hidden("nonce")}
           ${hidden("code_challenge")}
           ${hidden("state")}
           ${hidden("scope")}
           <p><label>Email<br>
             <input type="email" name="email" required
                    placeholder="someone@another-university.edu"></label></p>
           <button type="submit">Continue</button>
         </form>`,
      ),
    );
  });

  app.post(`${MOCK_IDP_PREFIX}/authorize`, startAuthorization);

  app.post(`${MOCK_IDP_PREFIX}/token`, async (request, reply) => {
    const code = formField(request, "code");
    const verifier = formField(request, "code_verifier");

    const record = pending.get(code);
    if (!record) {
      return reply.code(400).send({ error: "invalid_grant" });
    }
    pending.delete(code);

    if (record.expiresAt < Date.now()) {
      return reply.code(400).send({ error: "invalid_grant" });
    }

    // The same PKCE check a real provider performs.
    if (createCodeChallenge(verifier) !== record.codeChallenge) {
      return reply.code(400).send({ error: "invalid_grant" });
    }

    const email = pendingEmail.get(code) ?? DEMO_ACCOUNTS[0]!.email;
    pendingEmail.delete(code);

    const known = DEMO_ACCOUNTS.find((account) => account.email === email);
    const subject = known?.sub ?? `dev-${email.replace(/[^a-z0-9]+/gi, "-")}`;
    const name = known?.name ?? null;

    const idToken = await new SignJWT({
      email,
      email_verified: true,
      ...(name ? { name } : {}),
      nonce: record.nonce,
    })
      .setProtectedHeader({ alg: "RS256", kid })
      .setIssuer(issuer)
      .setSubject(subject)
      .setAudience(record.clientId)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    return reply.send({
      access_token: randomToken(24),
      token_type: "Bearer",
      expires_in: 300,
      id_token: idToken,
    });
  });

  app.get(`${MOCK_IDP_PREFIX}/logout`, async (_request, reply) => {
    reply.redirect("/signin.html");
  });
}
