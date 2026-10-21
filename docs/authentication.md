# Authentication and session lifecycle

## Login

Sign in with a unique username or an email address. Usernames are optional, case-insensitive, and 3-32 characters long; they cannot contain `@`. The login API's existing `email` field accepts either identifier. Login accepts an existing password without imposing a creation-length rule; normal password provisioning still requires 12-128 characters. Short passwords assigned directly for local development must be replaced before deployment.

1. The browser requests GET /api/auth/csrf. The API sets a random HttpOnly pre-login cookie and returns its HMAC token.
2. POST /api/auth/login requires the exact configured Origin, JSON, and the matching X-CSRF-Token. Strict validation rejects extra fields.
3. Argon2id verifies the password (19 MiB memory, two iterations, parallelism one). Unknown accounts use a dummy hash. Unknown, inactive, suspended, and invalid-password accounts receive the same error.
4. A fresh 256-bit opaque session token is generated. Only its HMAC-SHA256 digest is stored in sessions. The old browser session is revoked, last_login_at updates, and a new cookie is issued. Login locks the account against concurrent suspension/password changes.
5. The response contains a safe user profile and session-bound CSRF token. It never returns the password hash, plaintext password, or session cookie token.

## Cookies and expiry

Development cookies are HttpOnly, host-only, Path=/, SameSite=Lax by default. Production cookies additionally use Secure and the __Host- prefix. SameSite=None is allowed only with production HTTPS. Domain cookies are not used.

Default server expiry is 8 hours with a browser-session cookie. Remember-me uses a 7-day server expiry and persistent cookie. These are absolute lifetimes, without sliding extension. Authentication reloads the account role/status on each request and rejects expired/revoked sessions. A fresh login rotates the token; changed role/status/email or development password provisioning revokes affected sessions. Changing SESSION_SECRET invalidates existing hashes.

Logout requires CSRF, marks the session revoked, and clears the cookie. The frontend clears protected query data only after logout succeeds; failures are displayed so the user knows a server session may remain active.

## CSRF and CORS

Unsafe requests require an exact Origin match, application/json, and a constant-time comparison with the session-bound HMAC CSRF value. The login pre-session has its own binding and rotates for each login. CSRF values live only in memory, restored by /auth/me. Credentials are allowed only for the configured frontend origin, never a wildcard. No authentication tokens live in localStorage.

Cross-site cookies are subject to browser third-party-cookie restrictions. Prefer same-site custom domains or a reviewed same-origin proxy for production.

## Provisioning and security boundaries

No public registration exists. Administrators create inactive accounts; no invitation is fabricated. The development-only password command hashes an operator-supplied strong password, activates the existing account, and revokes sessions. It refuses production mode. Production onboarding/reset delivery remains a release blocker.

Login uses an IP rate limit of 20 attempts per 15 minutes per process. Configure TRUST_PROXY for the actual reverse proxy and use shared rate-limit storage before multiple replicas. Helmet adds response security headers. Logs omit request bodies, headers, credentials, and query strings. API errors never contain database statements or stack traces.

Expired/revoked session retention cleanup, MFA, verified password recovery, and an operator-facing session manager remain future work.
