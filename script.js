/* ==========================================================================
   Atlas — client scripts

   Two independent, self-contained blocks:
     1. Theme toggle  — runs on every page.
     2. Sign-in       — runs only on the page that has the sign-in markup.

   Plain ES5-style JavaScript: no build step, no dependencies, no imports.
   ========================================================================== */

/* ==========================================================================
   1. Theme toggle
   ========================================================================== */

(function () {
  "use strict";

  var STORAGE_KEY = "atlas-theme";
  var DARK_QUERY = "(prefers-color-scheme: dark)";

  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");

  /* Returns "dark", "light", or null when nothing valid is stored. */
  function readSavedTheme() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === "dark" || value === "light" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      /* Storage unavailable (private mode, blocked cookies): stay quiet. */
    }
  }

  function systemPrefersDark() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia(DARK_QUERY).matches
    );
  }

  /* Single place that touches the DOM, so markup and button stay consistent. */
  function applyTheme(theme) {
    var isDark = theme === "dark";

    root.setAttribute("data-theme", theme);

    if (!toggle) {
      return;
    }

    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.textContent = isDark ? "Light theme" : "Dark theme";
  }

  /* Starting theme: saved choice wins, then the OS, then light. */
  applyTheme(readSavedTheme() || (systemPrefersDark() ? "dark" : "light"));

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";

      applyTheme(next);
      saveTheme(next);
    });
  }

  /* Track OS changes only while the visitor has not chosen a theme. */
  if (typeof window.matchMedia === "function") {
    var query = window.matchMedia(DARK_QUERY);

    var onSystemChange = function (event) {
      if (!readSavedTheme()) {
        applyTheme(event.matches ? "dark" : "light");
      }
    };

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onSystemChange);
    } else if (typeof query.addListener === "function") {
      query.addListener(onSystemChange); /* Older Safari. */
    }
  }
})();

/* ==========================================================================
   2. Sign-in (OpenID Connect, Authorization Code flow with PKCE)

   How it works, in order:
     1. The visitor presses "Continue with your university account".
     2. We fetch the provider's discovery document, generate a PKCE verifier
        and challenge, remember them in sessionStorage, and redirect the
        browser to the provider's /authorize endpoint.
     3. The provider authenticates the person (on ITS OWN page — Atlas never
        sees or handles a password) and redirects back here with ?code=.
     4. We exchange that code for tokens directly with the provider, read the
        email claim out of the ID token, and require it to be a university
        address.

   Server-side note: this is a public client, so the browser holds the tokens
   in sessionStorage. That is acceptable for a prototype. For production with
   real student data, put a small backend in front (see PLAN.md, "Backend for
   frontend") so tokens live in httpOnly cookies and never touch JavaScript.

   The flow is inert until CONFIG below is filled in. If it is empty, the page
   says so plainly instead of pretending the visitor is signed in.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------
     CONFIG — fill these in from your university's identity provider.
     Nothing works until `issuer` and `clientId` are set.

     Microsoft Entra ID example:
       issuer:   "https://login.microsoftonline.com/<tenant-id>/v2.0"
       clientId: "<application-client-id>"

     Google Workspace for Education example:
       issuer:   "https://accounts.google.com"
       clientId: "<client-id>.apps.googleusercontent.com"
     ------------------------------------------------------------------ */
  var CONFIG = {
    issuer: "",
    clientId: "",
    scopes: "openid profile email",
    /*
      Leave empty to accept any verified university email. To enforce the
      university-only rule, list the domains you accept, for example:
        allowedEmailDomains: ["student.ox.ac.uk", "ox.ac.uk"]
    */
    allowedEmailDomains: [],
  };

  /* A page can override the config without editing this file. */
  if (window.ATLAS_AUTH && typeof window.ATLAS_AUTH === "object") {
    for (var key in window.ATLAS_AUTH) {
      if (Object.prototype.hasOwnProperty.call(window.ATLAS_AUTH, key)) {
        CONFIG[key] = window.ATLAS_AUTH[key];
      }
    }
  }

  var FLOW_KEY = "atlas.auth.flow"; /* PKCE verifier + state, during a redirect. */
  var SESSION_KEY = "atlas.auth.session"; /* Result of a successful sign-in. */

  /* ---- Elements (the script does nothing on pages without them) ---- */
  var startButton = document.getElementById("signin-start");
  var signOutButton = document.getElementById("signin-out");
  var messageBox = document.getElementById("auth-message");
  var signedOutPanel = document.getElementById("signed-out-panel");
  var signedInPanel = document.getElementById("signed-in-panel");
  var accountEmail = document.getElementById("account-email");

  if (!signedInPanel) {
    return; /* Not the sign-in page. */
  }

  /* ---- Small helpers ---- */

  /*
    sessionStorage only, and never fatal. sessionStorage is the safer of the
    two for tokens: it is scoped to the tab and cleared when the tab closes.
  */
  function storage(key, value) {
    try {
      if (value === undefined) {
        return window.sessionStorage.getItem(key);
      }
      if (value === null) {
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, value);
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function showMessage(text, isError) {
    if (!messageBox) {
      return;
    }
    messageBox.textContent = text;
    messageBox.className = isError ? "notice notice--error" : "notice";
    messageBox.hidden = false;
  }

  function hideMessage() {
    if (messageBox) {
      messageBox.hidden = true;
    }
  }

  function randomString(byteLength) {
    var bytes = new Uint8Array(byteLength);
    window.crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }

  /* RFC 7636: base64url with no padding. */
  function base64UrlEncode(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window
      .btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function base64UrlDecode(value) {
    var padded = value.replace(/-/g, "+").replace(/_/g, "/");
    while (padded.length % 4) {
      padded += "=";
    }
    return window.atob(padded);
  }

  /* PKCE S256 challenge: base64url(sha256(verifier)). */
  function computeChallenge(verifier) {
    var data = new TextEncoder().encode(verifier);
    return window.crypto.subtle.digest("SHA-256", data).then(function (digest) {
      return base64UrlEncode(new Uint8Array(digest));
    });
  }

  function decodeJwtPayload(token) {
    try {
      var parts = token.split(".");
      if (parts.length < 2) {
        return null;
      }
      return JSON.parse(base64UrlDecode(parts[1]));
    } catch (error) {
      return null;
    }
  }

  function emailFromClaims(claims) {
    if (!claims) {
      return null;
    }
    return claims.email || claims.preferred_username || claims.upn || null;
  }

  function emailDomainAllowed(email, domains) {
    if (!email || !domains || domains.length === 0) {
      return Boolean(email);
    }
    var at = email.lastIndexOf("@");
    if (at === -1) {
      return false;
    }
    var domain = email.slice(at + 1).toLowerCase();
    for (var i = 0; i < domains.length; i++) {
      if (domain === String(domains[i]).toLowerCase()) {
        return true;
      }
    }
    return false;
  }

  function redirectUri() {
    return window.location.href.split("#")[0].split("?")[0];
  }

  function isConfigured() {
    return Boolean(CONFIG.issuer && CONFIG.clientId);
  }

  /* ---- Views ---- */

  function showSignedOut() {
    if (signedOutPanel) {
      signedOutPanel.hidden = false;
    }
    signedInPanel.hidden = true;
  }

  function showSignedIn(session) {
    if (signedOutPanel) {
      signedOutPanel.hidden = true;
    }
    signedInPanel.hidden = false;
    if (accountEmail) {
      accountEmail.textContent = session.email || "your university account";
    }
  }

  function readSession() {
    var raw = storage(SESSION_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      storage(SESSION_KEY, null);
      return null;
    }
  }

  /* ---- Step 2: start the redirect ---- */

  function startSignIn() {
    if (!isConfigured()) {
      showMessage(
        "Sign-in is not configured yet. An administrator needs to set the " +
          "identity provider's issuer and client ID — see PLAN.md.",
        true
      );
      return;
    }

    hideMessage();
    if (startButton) {
      startButton.disabled = true;
    }

    var discoveryUrl =
      CONFIG.issuer.replace(/\/$/, "") + "/.well-known/openid-configuration";

    var verifier = randomString(32);
    var state = randomString(16);
    var nonce = randomString(16);

    computeChallenge(verifier)
      .then(function (challenge) {
        return fetch(discoveryUrl).then(function (response) {
          if (!response.ok) {
            throw new Error("discovery failed");
          }
          return response.json();
        }).then(function (metadata) {
          if (!metadata.authorization_endpoint) {
            throw new Error("no authorization endpoint");
          }

          storage(FLOW_KEY, JSON.stringify({
            verifier: verifier,
            state: state,
            nonce: nonce,
          }));

          var params = [
            "response_type=code",
            "client_id=" + encodeURIComponent(CONFIG.clientId),
            "redirect_uri=" + encodeURIComponent(redirectUri()),
            "scope=" + encodeURIComponent(CONFIG.scopes),
            "state=" + encodeURIComponent(state),
            "nonce=" + encodeURIComponent(nonce),
            "code_challenge=" + encodeURIComponent(challenge),
            "code_challenge_method=S256",
          ];

          window.location.assign(
            metadata.authorization_endpoint + "?" + params.join("&")
          );
        });
      })
      .catch(function () {
        if (startButton) {
          startButton.disabled = false;
        }
        showMessage(
          "Could not reach the university sign-in service. Check the issuer " +
            "URL and your connection, then try again.",
          true
        );
      });
  }

  /* ---- Step 4: finish the redirect ---- */

  function finishSignIn(code, returnedState) {
    var rawFlow = storage(FLOW_KEY);
    storage(FLOW_KEY, null);

    var flow = null;
    if (rawFlow) {
      try {
        flow = JSON.parse(rawFlow);
      } catch (error) {
        flow = null;
      }
    }

    /* The state check is what stops a forged callback from being accepted. */
    if (!flow || !returnedState || flow.state !== returnedState) {
      showMessage(
        "That sign-in attempt could not be verified. Please start again.",
        true
      );
      return;
    }

    var discoveryUrl =
      CONFIG.issuer.replace(/\/$/, "") + "/.well-known/openid-configuration";

    fetch(discoveryUrl)
      .then(function (response) {
        return response.json();
      })
      .then(function (metadata) {
        var body = [
          "grant_type=authorization_code",
          "code=" + encodeURIComponent(code),
          "redirect_uri=" + encodeURIComponent(redirectUri()),
          "client_id=" + encodeURIComponent(CONFIG.clientId),
          "code_verifier=" + encodeURIComponent(flow.verifier),
        ].join("&");

        return fetch(metadata.token_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body,
        }).then(function (response) {
          if (!response.ok) {
            throw new Error("token exchange failed");
          }
          return response.json();
        });
      })
      .then(function (tokens) {
        /*
          The ID token is read, not cryptographically verified. In a public
          client the tokens arrive directly from the token endpoint over TLS,
          which is the trust anchor here. A backend should verify the signature
          against the provider's JWKS before trusting any claim.
        */
        var claims = decodeJwtPayload(tokens.id_token || "");
        var email = emailFromClaims(claims);

        if (!email) {
          throw new Error("no email claim");
        }
        /* The nonce ties this ID token to the request we started. */
        if (!claims.nonce || claims.nonce !== flow.nonce) {
          throw new Error("nonce mismatch");
        }
        if (!emailDomainAllowed(email, CONFIG.allowedEmailDomains)) {
          throw new Error("email domain not allowed");
        }

        var session = {
          email: email,
          name: claims.name || null,
          expiresAt: tokens.expires_in
            ? Date.now() + tokens.expires_in * 1000
            : null,
          tokens: tokens,
        };
        storage(SESSION_KEY, JSON.stringify(session));

        /* Take the code out of the address bar so a refresh is clean. */
        if (window.history && window.history.replaceState) {
          window.history.replaceState({}, "", redirectUri());
        }

        hideMessage();
        showSignedIn(session);
      })
      .catch(function (error) {
        storage(SESSION_KEY, null);
        showSignedOut();
        showMessage(
          error && error.message === "email domain not allowed"
            ? "Atlas is only available to verified university accounts. " +
                "Please sign in with your university email address."
            : "We could not complete sign-in. Please try again.",
          true
        );
      });
  }

  function signOut() {
    var session = readSession();
    storage(SESSION_KEY, null);
    storage(FLOW_KEY, null);

    showSignedOut();
    showMessage("You have been signed out.", false);

    /* Best effort: also end the session at the provider. */
    var claims = session && session.tokens && session.tokens.id_token
      ? decodeJwtPayload(session.tokens.id_token)
      : null;

    if (isConfigured()) {
      fetch(
        CONFIG.issuer.replace(/\/$/, "") + "/.well-known/openid-configuration"
      )
        .then(function (response) {
          return response.json();
        })
        .then(function (metadata) {
          if (metadata.end_session_endpoint) {
            var url = metadata.end_session_endpoint;
            if (claims && claims.sub) {
              url += "?logout_hint=" + encodeURIComponent(claims.sub);
            }
            /* Note: this navigates away. Remove if you prefer a local sign-out. */
            window.location.assign(url);
          }
        })
        .catch(function () {
          /* Local sign-out already happened; nothing more to do. */
        });
    }
  }

  /* ---- Wiring ---- */

  if (startButton) {
    startButton.addEventListener("click", startSignIn);
  }
  if (signOutButton) {
    signOutButton.addEventListener("click", signOut);
  }

  var query = window.location.search || "";
  var codeMatch = /[?&]code=([^&]+)/.exec(query);
  var stateMatch = /[?&]state=([^&]+)/.exec(query);
  var errorMatch = /[?&]error=([^&]+)/.exec(query);

  if (errorMatch) {
    /* The provider reported a problem (for example, the user cancelled). */
    showSignedOut();
    showMessage(
      "Sign-in was cancelled or refused by the university service.",
      true
    );
  } else if (codeMatch) {
    showSignedOut();
    finishSignIn(
      decodeURIComponent(codeMatch[1]),
      stateMatch ? decodeURIComponent(stateMatch[1]) : null
    );
  } else if (readSession()) {
    showSignedIn(readSession());
  } else {
    showSignedOut();
  }

  if (!isConfigured()) {
    showMessage(
      "Sign-in is not configured yet. Set the identity provider's issuer and " +
        "client ID before this page can be used — see PLAN.md.",
      true
    );
  }

  /* Exposed so the future web app (and our tests) can reuse the pure helpers. */
  window.AtlasAuth = {
    base64UrlEncode: base64UrlEncode,
    base64UrlDecode: base64UrlDecode,
    computeChallenge: computeChallenge,
    decodeJwtPayload: decodeJwtPayload,
    emailDomainAllowed: emailDomainAllowed,
    emailFromClaims: emailFromClaims,
    isConfigured: isConfigured,
  };
})();
