Auth flow (BFF)

1. GET /auth/login?inst=<slug> (or derive from email/domain)
   - redirect to IdP with PKCE params; state stored server-side or signed
2. GET /auth/callback?code=...&state=...
   - verify state, exchange code (client secret on server), fetch userinfo/id_token
   - map claims (email, sub) to account in correct institution
   - create httpOnly secure SameSite=Lax session cookie
   - redirect to /app
3. GET /auth/me -> returns account + institution (or 401)
4. POST /auth/logout -> clears session

Security:
- PKCE enforced
- httpOnly Secure SameSite=Lax cookie
- CSRF protection for state-changing routes (double submit or SameSite + CSRF token)
- session rotation on login
- rate limit /auth/*

Notes:
- For pilot, single institution; later can select by email domain
