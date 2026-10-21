# Application architecture

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

The long-lived Node process owns one pool (default 5 connections). Verified TLS is enabled by default. Connection, idle, and statement timeouts are bounded. Shutdown drains HTTP requests and closes the pool. Transactions hold ticket locks for mutations and pair changes with activity rows.

User administration serializes changes with a PostgreSQL table lock so simultaneous attempts to remove different administrators cannot remove the last active administrator. Agent assignment locks the eligible user before the ticket. Deactivating/demoting an agent with assigned tickets is rejected until all assignments are removed. Deadlock/serialization conflicts return a retryable 409.

## Scope and limitations

Role permissions are enforced in the API and query predicates. Employee knowledge content is currently static, clearly labeled sample material. Notification delivery, uploads, SLA policies, and recovery are unavailable. Reports use database aggregates; current resolution times describe the latest completed lifecycle, not historical reopen cycles.

Tests exercise the real API against isolated PGlite PostgreSQL. Its single-connection execution cannot establish multi-connection contention behavior on Neon. Before production, verify pg/TLS connectivity, pooled migrations, concurrent locks, cookie/CORS behavior, proxy trust, rate limiting across replicas, backups, logging retention, and monitoring.

## References

- [Drizzle migration workflow](https://orm.drizzle.team/docs/migrations)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
