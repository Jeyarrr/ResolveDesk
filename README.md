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

**Phase 4.5: Premium analytics interface.** A coordinated dark-violet redesign now covers all three role dashboards, reporting, ticket workflows, notifications, login, and settings. The frontend continues using the existing PostgreSQL-backed APIs. See the [UI design and verification guide](docs/phase45-ui.md).

**Phase 4: Real-time operations, persistent notifications, SLA automation and reporting.** ResolveDesk runs against the existing local PostgreSQL database managed through pgAdmin 4. React connects to the Express API and persists ticket workflows locally. Neon is reserved for a future deployment milestone; it is not configured or required for current development.

Phase 3.1 adds structured resolution summaries, employee confirmation, reasoned reopening, audited administrator closure/reopening, lifecycle progress, and version checks for conflicting requests. See the [lifecycle rules and walkthrough](docs/ticket-lifecycle.md).

Phase 3.2 adds confirmed assignment/reassignment with reasons and conflict protection, unassigned filtering, private agent escalations, an administrator escalation queue, and SQL-backed workload counts. See [assignment and escalation rules, APIs, and walkthrough](docs/assignment-escalation.md). Existing lifecycle behavior remains available.

Phase 3.3 adds private file uploads and guarded downloads. Phase 3.4 adds attachment-enabled conversations, persistent unread tracking and saved replies. Phase 3.5 integrates these with lifecycle, assignment and escalation workflows. See the [attachment and collaboration guide](docs/attachments-conversations.md) for configuration, APIs, security boundaries and a three-role walkthrough.

## Objectives and functionality

Phase 4 adds authenticated Socket.IO updates, a persistent notification center and preferences, configurable Manila business-hour SLA policies, automatic deadline monitoring, and filtered reports with four CSV exports. See the [Phase 4 operations guide](docs/phase4-operations.md) for architecture, calculation rules, API contracts, limits and a simultaneous Jayr/George/Mon walkthrough.

- Employees submit and track their own support tickets and public conversations.
- Support agents manage assigned tickets, follow status transitions, and add internal notes.
- Administrators manage organizational tickets, assignments, priorities, accounts, departments, and categories.
- Database sessions, Argon2id password hashing, CSRF protection, role checks, and object-level authorization.
- Persistent public conversations, private support notes, database read cursors and transactional ticket activity history.
- Private PNG/JPG/WEBP/PDF/TXT attachments on tickets and messages, with upload progress, cancellation and authorized downloads/deletion.
- Shared saved replies, editable before sending, managed by agents and administrators.
- Audited reassignment, separate escalation history, and active agent workload information before assignment.
- Resolution summaries, resolving and closing actors, employee confirmation, and complete reopening history.
- Server pagination, search, category/priority/status filtering, and sorting.
- Role-scoped dashboards and database reports, trends, status and priority distributions.
- Live assignment, conversation, escalation and lifecycle updates with authorization checks and reconnect synchronization.
- Database notifications, read/unread filters, unread badges and configurable in-app preferences.
- First-response and resolution deadlines, policy snapshots, separate reopen cycles, warning and breach notifications.
- Administrator date/status/priority/category/department/agent filters, interactive charts and safe CSV reports.
- Responsive navigation, dark/light themes, keyboard navigation, and sample knowledge guides.

**Deferred:** password recovery/email invitations, production account onboarding, MFA, email/SMS/push delivery, PDF reports, SLA pauses, and the knowledge base backend. Screens explicitly describe availability. No public registration or demo role bypass exists.

## Stack and architecture

React 19 · TypeScript · Vite · Tailwind CSS 4 · Radix/shadcn-style UI · TanStack Query · React Hook Form · Zod · Express 5 · Drizzle ORM/Kit · PostgreSQL (local) · node-postgres · Argon2id.

Browser → React/TanStack Query → credentialed Express REST API → permission-aware services/repositories → bounded pg pool → local PostgreSQL.

Ticket transactions also write a PostgreSQL event outbox. The backend worker creates durable notifications and sends authorized Socket.IO invalidations; the browser refetches REST data. The same backend monitors indexed SLA deadlines without an open browser. Socket.IO uses WebSocket transport and requires a compatible persistent Node backend/proxy.

- `client/src`: UI, API client, query hooks, session provider, feature pages.
- `server/src`: configuration, routes/controllers, services, repositories, middleware, validation, database schema/scripts.
- `server/drizzle`: generated, versioned SQL migrations and snapshots.
- `docs`: [architecture](docs/architecture.md), [database](docs/database-plan.md), [authentication](docs/authentication.md), [permissions](docs/role-permissions.md), [API](docs/api-roadmap.md), [ticket lifecycle](docs/ticket-lifecycle.md), [deployment](docs/deployment.md).

## Local setup

Requires Node.js 24+, npm 10+, and local PostgreSQL. Existing installations should keep their working `server/.env` and database; no reset or reseeding is needed for Phase 4.

1. Install from the repository root:

```powershell
npm install
if (!(Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
if (!(Test-Path client/.env)) { Copy-Item client/.env.example client/.env }
```

2. For a new installation, create a dedicated local PostgreSQL database using pgAdmin and set its connection string in `server/.env` as `DATABASE_URL`. Use `DB_SSL=false` for the current local server. Keep an existing connection and session secret unchanged. If configuring a new instance, generate a `SESSION_SECRET` of at least 32 random bytes:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

This prints a secret to your local terminal. Store it only in the ignored server environment. Never put it in VITE variables or share its output.

3. Apply the checked-in additive migrations:

```powershell
npm run db:migrate -w server
```

For schema changes, edit `server/src/db/schema.ts`, run `npm run db:generate -w server`, review SQL, then migrate. The migration ledger prevents duplicate application. Startup never resets or migrates databases automatically. Do not use schema push/reset on shared databases.

Phase 3.1 migration `0002_sticky_garia.sql` adds resolution metadata and lifecycle versions to tickets, and explanations/version uniqueness to existing activity records. It preserves existing users, credentials, sessions, tickets, and history. No new table or status is introduced. Review migrations before applying them; review/approval is required for potentially destructive changes.

Phase 3.2 migrations `0003_gray_mysterio.sql` and `0004_tricky_zzzax.sql` add assignment versions and a separate escalation table with constraints and indexes. Existing records and local connection settings are preserved. Ticket statuses and account roles are unchanged.

Phase 3 migration `0005_bright_wraith.sql` adds attachment metadata, idempotent submission records, conversation read positions and saved replies. It adds a generated position to existing comments without replacing their contents or relationships. Keep the reviewed unique-index-before-foreign-key order. Existing installations only migrate; do not reseed.

Phase 4 migration `0006_equal_sunspot.sql` adds `operation_events`, `notifications`, `notification_preferences`, `sla_policies`, and `ticket_slas`, with foreign keys, indexes, deduplication constraints and four demonstration policies. It does not alter existing tables or records. Existing active tickets start SLA tracking when the worker first enrolls them; historical response/resolution times are not invented.

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

Open **http://127.0.0.1:5173**. Express uses port 4000; Vite proxies `/api` and `/socket.io` to Express. Use `127.0.0.1` consistently, matching CLIENT_ORIGIN. Missing server configuration produces a startup error; there is no mock fallback. The backend starts notifications and SLA monitoring automatically; no separate worker command is needed.

The root development launcher starts Vite and tsx directly with Node, avoiding nested Windows npm batch files and their `Terminate batch job (Y/N)?` prompts. Press Ctrl+C to stop both processes. It checks required configuration before launching either app. If PowerShell itself resolves `npm` to `npm.cmd`, use `npm.ps1 run dev` to avoid the outer batch wrapper as well.

The configured local database uses `DB_SSL=false`. Do not run application migrations in PostgreSQL's default `postgres` maintenance database. Connection settings remain environment-based for a future hosting migration.

Separate processes: `npm run server` (backend only) and `npm run dev -w client` (frontend only). The backend also supports `npm run dev -w server`. After building, start the backend with `npm start -w server`.

## Account provisioning

Administrators create inactive accounts through **Team management**. No password is returned by the API and no invitation email is claimed. For development only, put an existing account's email and a strong password into `PROVISION_EMAIL` / `PROVISION_PASSWORD` in the ignored server environment, then run:

```powershell
npm run user:password -w server
```

This hashes the supplied password, activates the account, and revokes its sessions. Remove the provisioning password afterward. Production delivery, identity verification, reset tokens, and initial administrator onboarding must be implemented before rollout.

## Environment variables

| Server variable        | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| DATABASE_URL           | Existing local PostgreSQL connection string; required                   |
| SESSION_SECRET         | Random HMAC secret, minimum 32 characters; required                     |
| CLIENT_ORIGIN          | Exact permitted frontend origin, no trailing slash                      |
| NODE_ENV               | development, test, or production                                        |
| PORT / HOST            | Listener; defaults 4000 / 127.0.0.1                                     |
| DB_SSL                 | false for the current local server; verified TLS required in production |
| DB_POOL_MAX            | Maximum connections per process, default 5                              |
| COOKIE_SAME_SITE       | lax default; none for genuinely cross-site HTTPS deployment             |
| TRUST_PROXY            | Trusted reverse-proxy hop count, default 0; configure for actual host   |
| EVENT_POLL_INTERVAL_MS | Outbox and socket session checks, default 1000 ms (250–10000)           |
| SLA_CHECK_INTERVAL_MS  | SLA monitoring interval, default 30000 ms (1000–300000)                 |

Private attachment defaults require no changes to an existing environment: `UPLOAD_DIR=uploads`, `UPLOAD_MAX_FILE_BYTES=10485760`, `UPLOAD_MAX_FILES=5`, and `UPLOAD_MAX_REQUEST_BYTES=53477376`. Relative storage paths resolve from the repository root. Keep the directory private and Git-ignored; custom paths need equivalent exclusions. Limits can be lowered, up to the supported 10 MB/file and 5 files/request ceilings. See [storage maintenance](docs/attachments-conversations.md#storage-and-maintenance).

Frontend: `VITE_API_URL` is a public API base ending in `/api`. Default `/api` uses the dev proxy. Optional `API_PROXY_TARGET` selects the development proxy backend. Server secrets never belong in VITE variables.

## Roles and APIs

| Role          | Access                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------- |
| Employee      | Own tickets, public replies, confirm resolution, reopen resolved requests                   |
| Agent         | Assigned tickets, active statuses, resolution summaries, reasoned reopening, internal notes |
| Administrator | All tickets, resolution, audited closure/closed-ticket reopening, existing admin controls   |

Endpoints include auth CSRF/login/me/logout; ticket listing/creation/details/edit/status/assignment; comments/activity; users; departments; ticket categories; dashboard analytics; and health. See [API reference](docs/api-roadmap.md).

## Validation and tests

See the [verification record](docs/verification.md) and [lifecycle rules](docs/ticket-lifecycle.md). Use isolated databases for all automated writes.

```powershell
npm test
npm run test:e2e
npm run test:postgres
npm run test:e2e:postgres
npm run typecheck
npm run lint
npm run build
npm run format:check
```

Install Chromium once with `npx playwright install chromium`. Browser tests exclusively own ports 5174/4101 and refuse to reuse existing servers; normal development can remain on 5173/4000. Test credentials are random per run. Default tests use isolated PGlite PostgreSQL, excluded from production builds. `test:postgres` and `test:e2e:postgres` create separate local `resolvedesk_test_*` databases using the configured local PostgreSQL account (which needs CREATEDB permission). They never reset or seed the application database. Test databases are retained in pgAdmin for inspection; the commands print their names, never credentials. Native tests exercise separate connections, locking, duplicate submissions, rollback, permissions, persistence, and real browser workflows.

These tests validate local PostgreSQL multi-connection contention. Hosted networking/TLS and deployed cookies/proxies remain future deployment checks. Legacy Phase 1 mock-store tests remain regression fixtures; authentication and application server data no longer use that store.

## Roadmap and repository safety

Phases 1–4 are implemented locally. Phase 5 can address hosted PostgreSQL, persistent WebSocket hosting, private object storage, onboarding/recovery, backups, and deployment validation. Horizontal scaling needs shared socket/event fan-out and shared throttling; database locks already prevent duplicate SLA outcomes. Assignment remains manual; automatic workload balancing is not implemented.

No automatic deployment, commits, pushes, database wipes, or history rewrites are part of this phase.

Suggested commit: `feat: implement real-time notifications SLA monitoring and analytics`.
