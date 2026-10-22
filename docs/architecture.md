# Application architecture

## Phase 3.2 support operations

The existing ticket service owns assignment/reassignment, locking eligible agents and tickets before a version-checked update and activity insert. Assignment versions are separate from lifecycle versions. The lifecycle service remains unchanged. `services/escalations.ts` owns scoped escalation reads and transactional requests/acknowledgement/resolution; `services/workloads.ts` aggregates current ticket assignments for active agents. All APIs reuse session authentication, CSRF checks and centralized errors.

Ticket details reuse Dialog, Button, Card and query hooks for assignment and escalation. The administrator **Escalations & Workload** page combines paginated queue and workload views. Successful mutations and conflicts refresh protected query caches. See [policies and concurrency boundaries](assignment-escalation.md).

## Runtime

The existing React application retains its shell, themes, reusable controls, ticket table, forms, charts, and role navigation. TanStack Query owns remote state. Local storage is used only for appearance/sidebar preferences; legacy mock modules are retained as regression fixtures and are not used for live tickets or authentication.

The API client includes credentials, sends the in-memory CSRF token for JSON mutations, supports cancellation, and exposes safe errors. Protected queries use a common cache prefix. Login/logout cancel and clear caches. Unauthorized responses clear protected data and redirect through the session gate. Session restoration loads the database-backed profile.

## Backend layers

- Configuration: validates required environment values and production TLS/origin constraints.
- Routes: HTTP methods, authentication/role gates, login throttling, CSRF.
- Controllers: strict Zod parsing, service calls, consistent response envelopes.
- Services: authentication, status transitions, transactional ticket changes, user safeguards, aggregates.
- Repositories: role-scoped ticket queries and safe profile projections.
- Database: Drizzle PostgreSQL schema, migrations, bounded pg pool.

No controller includes raw business SQL. Aggregation SQL is parameterized in the analytics service; ticket/user query helpers live in repositories or their focused services.

## Connections and consistency

The long-lived Node process owns one pool (default 5 connections). The current local PostgreSQL server uses the existing environment's `DB_SSL=false`; production still requires verified TLS. Connection, idle, and statement timeouts are bounded. Shutdown drains HTTP requests and closes the pool. Transactions hold ticket locks for mutations and pair changes with activity rows.

Phase 3.1 centralizes lifecycle policy in `services/lifecycle.ts`. The detail endpoint returns viewer-specific actions, avoiding a second frontend transition policy. Special actions require the viewed lifecycle version; the transaction rechecks scope/status and writes the ticket and versioned activity event atomically. Resolution history uses the existing activity table. The UI reuses the current Dialog, Card, Button, and TanStack Query invalidation patterns.

User administration serializes changes with a PostgreSQL table lock so simultaneous attempts to remove different administrators cannot remove the last active administrator. Agent assignment locks the eligible user before the ticket. Deactivating/demoting an agent with assigned tickets is rejected until all assignments are removed. Deadlock/serialization conflicts return a retryable 409.

## Scope and limitations

Role permissions are enforced in the API and query predicates. Employee knowledge content is currently static, clearly labeled sample material. Notification delivery, uploads, SLA policies, and recovery are unavailable. Reports use database aggregates; current resolution times describe the latest completed lifecycle, not historical reopen cycles.

Tests exercise the real API against isolated PGlite and separate local native PostgreSQL databases. Native lifecycle tests establish multi-connection locking behavior on the local server. Browser tests use separate ports and databases. Before production, verify hosted database connectivity/TLS, migrations, cookie/CORS behavior, proxy trust, rate limiting across replicas, backups, logging retention, and monitoring.

## References

- [Drizzle migration workflow](https://orm.drizzle.team/docs/migrations)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
