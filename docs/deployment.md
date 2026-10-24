# Deployment preparation (not deployed)

This document is a future Phase 5 deployment reference. Current development runs on the existing local PostgreSQL database through pgAdmin 4 with `DB_SSL=false`. Phase 4 does not configure Neon, change the local connection, synchronize data, or deploy anything.

## Frontend: Vercel

Use client as the Vercel root directory with the Vite framework preset. Install the npm workspace dependencies from the repository; build with npm run build -w client from the repository root (or npm run build from client). Output is client/dist (dist relative to client). client/vercel.json rewrites client routes to index.html.

Set public VITE_API_URL=https://YOUR-API-HOST/api before building. Do not put DATABASE_URL or SESSION_SECRET into Vite variables. Default /api is only appropriate with an actual same-origin API proxy; the supplied Vercel rewrite does not provide that proxy.

## Backend: long-lived Node host

Phase 4 adds Socket.IO using WebSocket transport and an in-process persistent-work scheduler. The host/proxy must support WebSocket upgrades on `/socket.io`, preserve the exact allowed Origin, and keep the Node process running for SLA monitoring. Migration `0006` must precede startup. The worker reconciles missed deadlines on restart; no frontend or extra worker command is required.

Before adding replicas, provide a shared Socket.IO adapter and event fan-out so committed updates reach all instances. Current PostgreSQL locks/unique keys prevent duplicate notifications and SLA breaches across workers, but in-memory sockets are local to one process. The worker is unsuitable for ephemeral request-only/serverless execution. Add capacity testing and outbox/notification retention before production scale.

Install production dependencies, run npm run build -w server during the build stage with TypeScript available, and start npm start -w server. Set NODE_ENV=production, HOST=0.0.0.0, the host-assigned PORT, verified DB_SSL=true, DATABASE_URL, a strong SESSION_SECRET, and exact HTTPS CLIENT_ORIGIN.

Set TRUST_PROXY only to the real trusted hop count documented by the host. In-memory login throttling assumes one API process. Add a shared rate-limit store before horizontal scaling. Configure HTTPS, request limits, logs/monitoring, graceful shutdown, backups, and alerts.

## Neon

Use a dedicated project/branch for each environment. The API uses a pooled Neon hostname with a bounded pg pool, verified TLS certificates, and timeouts. Size aggregate connection usage across all replicas within plan limits. Do not disable verification to resolve certificate failures.

Apply reviewed migrations as an explicit release step from a trusted environment. The migration command reads server environment settings and uses the same verified driver. Production startup never runs migrations/seeds or resets data. Verify migration permissions and pooling behavior against a disposable Neon development branch before promoting changes.

## Cookies and origin

Prefer app.example.com and api.example.com over unrelated domains. Same-site deployments can use SameSite=Lax. A Vercel default domain and unrelated API host generally require COOKIE_SAME_SITE=none with production Secure cookies; browser third-party-cookie policies may still block them. Plan a same-site custom domain or reviewed same-origin proxy if necessary.

CORS allows one exact origin with credentials. Do not add wildcard origins. Test login, refresh, CSRF failures, session expiry, logout, browser privacy settings, and proxy IP handling on the actual deployed origins.

## Release blockers

No deployment occurred. Neon credentials are absent, so live connectivity/TLS, migrations, pool behavior, and multi-connection contention remain unverified. Production account onboarding/reset delivery is not implemented. Do not publish development seed credentials or run development provisioning against production.

PGlite tests validate application PostgreSQL semantics, not hosted behavior. Before release, repeat authorization/IDOR checks, verify the last-admin/assignment locks using separate Neon connections, inspect production error handling, configure backups and session retention, and conduct a deployment security review.
