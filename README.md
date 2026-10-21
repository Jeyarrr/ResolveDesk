# ResolveDesk

A modern IT Help Desk & Ticket Management System designed to streamline technical support requests, ticket assignments, issue tracking, and resolution workflows.

## Demo accounts

Explore ResolveDesk from three perspectives: Administrator, Employee, and IT Support Agent. The following accounts are configured in the project's current local demo database.

| Name   | Role          | Department           | Username | Password |
| ------ | ------------- | -------------------- | -------- | -------- |
| Jayr   | Administrator | Administration       | `jear`   | `jear`   |
| Mon    | Employee      | General              | `monmon` | `monmon` |
| George | Agent         | Human Resources (HR) | `geor`   | `geor`   |

Start the configured project with `npm run dev`, open [ResolveDesk locally](http://127.0.0.1:5173), and enter a username and password in the login form. Log out before switching accounts.

### Suggested walkthrough

1. **Employee — Mon:** Submit a support ticket, choose its category and priority, and follow its progress.
2. **Administrator — Jayr:** Find the ticket, assign it to George, and explore user management and reporting.
3. **Agent — George:** Open the assigned ticket, update its status, reply to the employee, and add an internal support note.
4. **Employee — Mon:** Return to the ticket to view public replies and the updated status. Internal support notes are visible only to support staff and administrators.

George has the `agent` role and belongs to the HR department. The demo credentials above apply to the configured local database; a fresh installation uses the email accounts and seed passwords described in [Local setup](#local-setup).

## Development status

**Phase 2 implemented; Neon and production verification pending.** The React interface connects to Express APIs and PostgreSQL. Automated integration checks use isolated PostgreSQL through PGlite and never connect to a shared database. A real Neon connection, production onboarding, and production verification are still required before deployment.

## Objectives and functionality

- Employees submit and track their own support tickets and public conversations.
- Support agents manage assigned tickets, follow status transitions, and add internal notes.
- Administrators manage organizational tickets, assignments, priorities, accounts, departments, and categories.
- Database sessions, Argon2id password hashing, CSRF protection, role checks, and object-level authorization.
- Persistent conversations and transactional ticket activity history.
- Server pagination, search, category/priority/status filtering, and sorting.
- Role-scoped dashboards and database reports, trends, status and priority distributions.
- Responsive navigation, dark/light themes, keyboard navigation, and sample knowledge guides.

**Deferred:** password recovery/email invitations, production account onboarding, file uploads, real-time notifications, SLA automation, MFA, advanced analytics, and the knowledge base backend. Screens explicitly describe availability. No public registration or demo role bypass exists.

## Stack and architecture

React 19 · TypeScript · Vite · Tailwind CSS 4 · Radix/shadcn-style UI · TanStack Query · React Hook Form · Zod · Express 5 · Drizzle ORM/Kit · PostgreSQL (Neon) · node-postgres · Argon2id.

Browser → React/TanStack Query → credentialed Express REST API → permission-aware services/repositories → bounded pg pool → Neon PostgreSQL.

- `client/src`: UI, API client, query hooks, session provider, feature pages.
- `server/src`: configuration, routes/controllers, services, repositories, middleware, validation, database schema/scripts.
- `server/drizzle`: generated, versioned SQL migrations and snapshots.
- `docs`: [architecture](docs/architecture.md), [database](docs/database-plan.md), [authentication](docs/authentication.md), [permissions](docs/role-permissions.md), [API](docs/api-roadmap.md), [ticket lifecycle](docs/ticket-lifecycle.md), [deployment](docs/deployment.md).

## Local setup

Requires Node.js 24+, npm 10+, and a dedicated development PostgreSQL/Neon database.

1. Install from the repository root:

```powershell
npm install
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

2. In Neon, select a **development** database/branch. Copy its pooled connection string into `server/.env` as `DATABASE_URL`. Set a cryptographically random `SESSION_SECRET` (at least 32 characters; preferably 32 random bytes encoded as hex). Generate one locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

This prints a secret to your local terminal. Store it only in the ignored server environment. Never put it in VITE variables or share its output.

3. Apply the checked-in additive migrations:

```powershell
npm run db:migrate -w server
```

For schema changes, edit `server/src/db/schema.ts`, run `npm run db:generate -w server`, review SQL, then migrate. The migration ledger prevents duplicate application. Startup never resets or migrates databases automatically. Do not use schema push/reset on shared databases.

4. For initial **development** accounts, set three different strong passwords (12–128 characters) in ignored `server/.env`:

- `SEED_ADMIN_PASSWORD`
- `SEED_AGENT_PASSWORD`
- `SEED_EMPLOYEE_PASSWORD`
- Intentionally set `CONFIRM_DEVELOPMENT_SEED=yes`; keep `NODE_ENV=development`.

```powershell
npm run db:seed -w server
```

Accounts: `admin@resolvedesk.example`, `agent@resolvedesk.example`, and `employee@resolvedesk.example`, using the passwords you supplied. The seed adds departments, categories, and an assigned sample ticket with public/internal comments. Repeated runs preserve existing passwords and avoid duplicating the sample ticket. Run one seed process at a time. Remove seed passwords and restore the confirmation to `no` afterward. Production seeding is refused.

Fresh development seeds create Jayr (`admin`, Administration), George (`agent`, Human Resources), and Mon (`employee`, General). HR is a department, not an additional role. Existing account IDs, emails, passwords, names, department choices, and sessions are preserved when reseeding; the seed does not overwrite existing accounts.

5. Start both applications:

```powershell
npm run dev
```

Open **http://127.0.0.1:5173**. Express uses port 4000; Vite proxies `/api` to Express. Use `127.0.0.1` consistently, matching CLIENT_ORIGIN. Missing server configuration produces a startup error; there is no mock fallback.

The root development launcher starts Vite and tsx directly with Node, avoiding nested Windows npm batch files and their `Terminate batch job (Y/N)?` prompts. Press Ctrl+C to stop both processes. It checks required configuration before launching either app. If PowerShell itself resolves `npm` to `npm.cmd`, use `npm.ps1 run dev` to avoid the outer batch wrapper as well.

For local PostgreSQL, create a dedicated `resolvedesk` database and use its connection string in `server/.env`, with `DB_SSL=false` for a local server without TLS. Do not run application migrations in PostgreSQL's default `postgres` maintenance database. Neon connections continue to require `DB_SSL=true`.

Separate processes: `npm run server` (backend only) and `npm run dev -w client` (frontend only). The backend also supports `npm run dev -w server`. After building, start the backend with `npm start -w server`.

## Account provisioning

Administrators create inactive accounts through **Team management**. No password is returned by the API and no invitation email is claimed. For development only, put an existing account's email and a strong password into `PROVISION_EMAIL` / `PROVISION_PASSWORD` in the ignored server environment, then run:

```powershell
npm run user:password -w server
```

This hashes the supplied password, activates the account, and revokes its sessions. Remove the provisioning password afterward. Production delivery, identity verification, reset tokens, and initial administrator onboarding must be implemented before rollout.

## Environment variables

| Server variable  | Purpose                                                               |
| ---------------- | --------------------------------------------------------------------- |
| DATABASE_URL     | PostgreSQL/Neon connection string; required                           |
| SESSION_SECRET   | Random HMAC secret, minimum 32 characters; required                   |
| CLIENT_ORIGIN    | Exact permitted frontend origin, no trailing slash                    |
| NODE_ENV         | development, test, or production                                      |
| PORT / HOST      | Listener; defaults 4000 / 127.0.0.1                                   |
| DB_SSL           | true by default; verified TLS required in production                  |
| DB_POOL_MAX      | Maximum connections per process, default 5                            |
| COOKIE_SAME_SITE | lax default; none for genuinely cross-site HTTPS deployment           |
| TRUST_PROXY      | Trusted reverse-proxy hop count, default 0; configure for actual host |

Frontend: `VITE_API_URL` is a public API base ending in `/api`. Default `/api` uses the dev proxy. Optional `API_PROXY_TARGET` selects the development proxy backend. Server secrets never belong in VITE variables.

## Roles and APIs

| Role          | Access                                                                    |
| ------------- | ------------------------------------------------------------------------- |
| Employee      | Own tickets, create request, public replies/activity                      |
| Agent         | Assigned tickets, allowed statuses, public replies/internal notes         |
| Administrator | All tickets, assignment/priority/details, accounts/references, statistics |

Endpoints include auth CSRF/login/me/logout; ticket listing/creation/details/edit/status/assignment; comments/activity; users; departments; ticket categories; dashboard analytics; and health. See [API reference](docs/api-roadmap.md).

## Validation and tests

See the [Phase 2 verification record](docs/verification.md) for completed checks and the boundary between isolated PostgreSQL tests and pending Neon validation.

```powershell
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
npm run format:check
```

Install Chromium once with `npx playwright install chromium`. Stop development servers before browser tests: tests exclusively own ports 5173/4100 and refuse to reuse existing servers. Test credentials are random per run. Vitest uses isolated PGlite databases; Playwright starts the actual Express application with its own isolated PGlite database. A disk-backed test verifies reopening and migration idempotency. PGlite is test-only and excluded from the production server build.

These tests do not validate Neon networking/TLS, multi-connection contention, or deployed cookies/proxies. Those remain deployment checks. Legacy Phase 1 mock-store tests remain regression fixtures; authentication and application server data no longer use that store.

## Roadmap and repository safety

Phase 3: verify Neon and hosted cookie/CORS behavior, implement verified onboarding/recovery, private object storage, notifications, knowledge administration, SLA policies, monitoring, backups, and deployment hardening. Configure shared rate-limit storage before running multiple API replicas.

No automatic deployment, commits, pushes, database wipes, or history rewrites are part of this phase.

Suggested commit: `feat: implement ResolveDesk phase 2 backend and authentication`.
