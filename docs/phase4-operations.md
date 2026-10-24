# Phase 4: live operations, notifications, SLA and reports

ResolveDesk keeps the existing Express, React/TanStack Query, Drizzle and local PostgreSQL architecture. No cloud service, Redis, hosting or deployment is introduced. Existing credentials, roles, ticket relationships and private upload storage remain unchanged.

## Run locally

Keep the existing `server/.env`. Apply the reviewed additive migration, then start the project:

```powershell
npm run db:migrate -w server
npm run dev
```

`npm run server` starts the API, Socket.IO and background operations worker together. The frontend remains available separately through `npm run dev -w client`. The worker runs while the backend is running, even with no browsers open. `npm start -w server` starts the built backend after `npm run build`.

| Setting                  | Default         | Purpose                                                            |
| ------------------------ | --------------- | ------------------------------------------------------------------ |
| `EVENT_POLL_INTERVAL_MS` | 1000            | Outbox processing and idle socket session validation; 250–10000 ms |
| `SLA_CHECK_INTERVAL_MS`  | 30000           | Reconcile due SLA obligations; 1000–300000 ms                      |
| `CLIENT_ORIGIN`          | Existing origin | Exact allowed WebSocket and HTTP mutation origin                   |

Defaults work without changing an existing environment. The Vite proxy forwards `/api` and `/socket.io` to the existing backend. A configured `VITE_API_URL` selects the backend origin for sockets as well.

## Database additions

### Implementation map

- New backend modules: `server/src/realtime.ts`, `routes/operations.ts`, and `services/business-time.ts`, `event-store.ts`, `notifications.ts`, `operations.ts`, `reports.ts`, `sla.ts`.
- Existing backend integration: `index.ts`, `config/env.ts`, `routes/index.ts`, `db/schema.ts`, and ticket/lifecycle/escalation/attachment services. Existing authentication and ticket scope remain authoritative.
- New frontend modules: `client/src/app/realtime.tsx`, `features/notifications/notification-center.tsx`, `features/tickets/sla.tsx`, `features/dashboard/operations-charts.tsx`, and `services/operations-contracts.ts`.
- Existing frontend integration: providers, app shell, notifications, settings, dashboards, ticket detail, reports, API download helper and Vite proxy.
- Database files: `server/drizzle/0006_equal_sunspot.sql`, its schema snapshot and migration journal.
- Tests/tooling: `server/src/operations.test.ts`, `tests/e2e/operations.spec.ts`, existing workspace assertions, browser server, native PostgreSQL runner and Playwright configuration. Browser scenarios share one fixture and run sequentially; the real-time scenario opens three concurrent role contexts.
- Dependencies/configuration: client/server package manifests, lockfile and environment examples. Actual environment files remain unchanged.
- Documentation: README, architecture, database plan, API reference, permissions, deployment preparation, verification record and this guide.

Migration `0006_equal_sunspot.sql` creates:

- `operation_events`: durable outbox with unique business-event key, ticket, actor, event type, visibility, recipient/audience IDs and processing timestamp.
- `notifications`: recipient-owned alert, ticket, event, safe title/type, read timestamp and creation timestamp. A unique event/recipient constraint prevents duplicates.
- `notification_preferences`: supported in-app categories for each user.
- `sla_policies`: one policy per priority, response/resolution business-minute targets, warning threshold, calendar and activation state.
- `ticket_slas`: ticket/cycle uniqueness, policy snapshot, start/deadline/warning timestamps, response/resolution measurements, breach timestamps and indexed next-check time.

Foreign keys restrict deletion. Pending events, unread notifications, recipient chronology and next SLA checks have indexes. The migration inserts four demonstration policies into the new policy table. It does not replace or reseed application accounts or existing tickets. Existing attachment bytes are untouched.

## Transaction and delivery architecture

The existing ticket, lifecycle, escalation and attachment transactions call `recordOperation`. It writes the existing audit entry, updates the appropriate SLA cycle and inserts the outbox event in the same transaction. A failed transaction creates neither a committed event nor a notification. Existing submission and lifecycle version checks continue preventing duplicate business actions.

The background worker claims up to 100 pending events with PostgreSQL `FOR UPDATE SKIP LOCKED`. Notification inserts and the processing marker commit together. Relevant recipient IDs are selected on the server, excluding the actor; current account status, ticket access, visibility and stored preferences are checked again during delivery. An event/recipient unique key protects repeated processing.

Socket delivery follows the commit. Packets contain only an event ID, type and ticket ID, never comment bodies, reasons, file locations or credentials. Notifications persist independently of socket availability. Live invalidation is best effort: a crash after processing commits but before broadcasting can lose a packet, but REST refetch on reconnect/window focus restores the persistent state. No claim of exactly-once WebSocket delivery is made.

## Socket.IO security and client lifecycle

The existing HTTP server owns Socket.IO. WebSocket-only transport ensures browser handshakes include an Origin header; only the exact configured origin is allowed. Handshake authentication uses the existing HttpOnly session cookie and session-derived CSRF token. User ID and role are read from PostgreSQL, never accepted from the client.

Connections join a server-selected user room. Optional `subscribe-ticket` accepts only a UUID, checks current ticket access, rate limits subscription changes and replaces the previous ticket room. Broadcasts independently revalidate the session and current ticket scope; room membership is not an authorization boundary. Internal events never go to employees. A former assignee receives only a generic cache-reset signal, without restricted event content. Expiration, logout, suspension and role changes are checked before delivery/subscription and during idle validation (normally within one second).

React manages one socket per authenticated session, removes listeners and timers on logout/account changes, coalesces invalidations, deduplicates recent event IDs, and refetches protected TanStack Query state after reconnection. Permission loss resets cached data. Connection failure displays a small status message; HTTP workflows and manual refresh remain usable. Temporary failures retry with authentication.

Supported `operation.type` values:

`ticket_created`, `ticket_assigned`, `ticket_reassigned`, `ticket_status_changed`, `ticket_updated`, `ticket_reply_received`, `internal_note_created`, `ticket_resolved`, `ticket_reopened`, `resolution_confirmed`, `escalation_requested`, `escalation_acknowledged`, `escalation_resolved`, `attachment_added`, `attachment_deleted`, `sla_warning`, `sla_breached`.

Assignment events expose only the safe invalidation fields to authorized participants; reassignment reasons remain internal audit content. Attachment events invalidate data without creating redundant alerts. SLA notifications identify response versus resolution targets.

## Notification experience

The topbar bell displays the real unread count and opens recent notifications. The Notifications page supports read/unread/all filters, pagination, ticket links, individual read actions and mark-all-read. Settings stores preferences for assignments, replies/internal notes, status/intake, escalations and SLA alerts. Preferences affect future alert creation; existing alerts remain available. Email, SMS and browser push are not configured.

Creation alerts go to administrators; assignment alerts go to the assigned agent; public replies and lifecycle events go to relevant authorized participants except the actor. Escalation intake alerts go to administrators. Internal alerts are support-only. Every list/count/read operation checks recipient ownership and current ticket access, so old-assignee alerts cannot expose transferred tickets.

## SLA policy and timing definitions

| Priority | First response                  | Resolution              |
| -------- | ------------------------------- | ----------------------- |
| Low      | 960 business minutes (16 hours) | 2400 minutes (40 hours) |
| Medium   | 480 minutes (8 hours)           | 1440 minutes (24 hours) |
| High     | 120 minutes (2 hours)           | 480 minutes (8 hours)   |
| Critical | 30 minutes                      | 240 minutes (4 hours)   |

These are demonstration targets, not industry standards. Administrators edit them in Settings, including active status, warning percentage, opening/closing hours, weekdays and explicit holiday dates. The supported timezone is **Asia/Manila** (UTC+8, no DST). All stored timestamps are UTC. Default business periods are Monday–Friday, 09:00–18:00. Weekends and time outside configured periods do not consume allowance. No holidays are assumed: only listed dates are excluded. A full business day is nine hours under the default calendar.

- New tickets start cycle 1 at creation. The policy and calendar are copied into an immutable cycle snapshot.
- First response is the first public reply by an administrator or agent other than the requester. Employee replies, internal notes, attachments and automated events do not satisfy it.
- Resolution completes at the actual resolve operation, not later employee confirmation. Confirmation/administrative closure retains that completed cycle.
- Resolution without a qualifying public response does not fabricate a response measurement. It appears as **No qualifying response**, or a breach when its response deadline was exceeded, and cannot satisfy both-target compliance.
- Reopening creates a new response and resolution cycle using the policy currently enabled for the ticket's priority. Prior cycles remain available. Priority, assignment and policy edits do not rewrite an already-applied snapshot.
- **Pending does not pause either target.** Pause/resume controls are deliberately absent; there are no undocumented deductions for support delays.
- Disabled policies stop new cycles for that priority; existing cycles continue under their snapshot.
- Existing active tickets without an SLA are adopted incrementally from the time the worker first processes them. Historical creation/response timings are not invented or retroactively breached. Existing resolved/closed tickets remain untracked until reopened under an enabled policy.

Warnings default to 80% of the business allowance. The worker stores warning/breach timestamps, selects indexed due work in batches, locks the ticket before rechecking the cycle, and uses unique event keys for each cycle/target/outcome. Local executions do not overlap; database locks and constraints prevent duplicate outcomes across concurrent workers. Startup reconciles overdue work; outages are logged and retried without clearing durable state. A late reply/resolution records the breach even if it occurs before the next worker pass.

Server-derived states are **Within Target**, **Approaching Deadline**, **Breached**, **Completed Within Target**, and **Completed After Breach**. The UI also explicitly shows missing qualifying responses. Remaining business minutes are informational; persisted deadlines and server calculations are authoritative. Dashboards use SQL aggregates over all authorized current cycles and show the earliest active deadlines. Employees see only their own targets, without agent timing averages.

## Analytics and exports

The existing Reports page uses real filtered database records and the existing Recharts library. Filters cover inclusive Manila calendar dates, status, priority, category, requester department and current assigned agent. The default is the last 30 days; maximum range is 366 days. Daily/weekly/monthly buckets use Manila dates, with Monday-start weeks.

Reports run in a repeatable-read, read-only transaction. The selected cohort consists of tickets created in the date range. Status, priority, category and department counts describe that cohort's current state. Reopened-ticket frequency is the number of cohort tickets ever reopened divided by cohort size; reopen-event count is separate. Volume charts count cohort creations and SLA cycle resolutions within the selected date boundaries. No data produces null averages/percentages and explicit empty indicators, not fabricated measurements.

Business-minute averages/median come from SLA measurements, excluding absent measurements. Overall compliance uses **completed cycles** as denominator and requires both response and resolution within target. Response compliance uses cycles with a qualifying response; unanswered completed cycles are separately counted. Resolution compliance uses completed resolution cycles. Active obligations and approaching/breached states are reported separately. Historical untracked tickets remain in ticket totals but do not enter measured SLA denominators.

Agent measures attribute cohort tickets and latest-cycle outcomes to the **current assignee**. They are operational workload measures, not a reconstruction of historical assignment ownership or a complete assessment of staff performance. Charts show ticket volume, status, priority, completed SLA outcomes, agent workload, resolution trends, breach trends, priority breaches, categories and departments. The agent table includes breach counts and averages.

Exports provide ticket summary, ticket performance, agent workload and SLA cycle reports using the same filters. Outputs exclude credentials, sessions, private notes and unnecessary requester identifiers. CSV quoting handles commas, quotes and newlines; cells beginning with formula-sensitive prefixes are neutralized. Filenames identify the report/date range. Reports are bounded to 10,000 tickets / 20,000 SLA cycles; exceeding the limit returns a clear error requiring narrower filters. They are buffered, not streamed. PDF export is outside this phase.

## API additions

All paths use `/api` and existing authentication, JSON envelopes, validation and CSRF rules. Download responses use CSV attachment headers. Notification/SLA read permissions are enforced by the server; reports and policy management require admin.

| Method    | Path                          | Contract                                                    |
| --------- | ----------------------------- | ----------------------------------------------------------- |
| GET       | `/notifications`              | `page`, `limit` (1–100), `state=all/read/unread`            |
| GET       | `/notifications/unread-count` | Current authorized unread count                             |
| PATCH     | `/notifications/:id/read`     | Empty JSON body, own accessible alert                       |
| PATCH     | `/notifications/read-all`     | Empty JSON body, own accessible alerts                      |
| GET/PATCH | `/notifications/preferences`  | Five supported boolean categories                           |
| GET       | `/tickets/:id/sla`            | Authorized cycles, newest first, computed states            |
| GET       | `/sla/overview`               | Role-scoped current-cycle aggregates and upcoming targets   |
| GET       | `/sla/policies`               | Administrator policy list                                   |
| PATCH     | `/sla/policies/:id`           | Validated name, targets, threshold, calendar and activation |
| GET       | `/analytics/overview`         | Filtered metrics, distributions, series and agent measures  |
| GET       | `/reports/export`             | Same filters plus `format=summary/performance/agents/sla`   |

Reporting query names: `from`, `to` (`YYYY-MM-DD`), `status`, `priority`, `category`, `department`, `agent` (UUID references), `interval=day/week/month`. Unknown fields and invalid ranges are rejected. Existing `/analytics/dashboard` remains compatible; its legacy `sla` field stays null. New SLA data comes from `/sla/overview` and `/analytics/overview`.

## Manual verification with the existing accounts

1. Run PostgreSQL and `npm run dev`. Use separate browser profiles/private contexts for Jayr (`jear`), George (`geor`) and Mon (`monmon`); passwords remain the same as their usernames in the configured local demo.
2. Keep Jayr's Notifications page and George's assigned queue open. Mon creates a ticket. Jayr receives the intake alert without refreshing.
3. Jayr assigns it to George. George sees the assignment alert and queue update, then opens the ticket's service targets.
4. George starts investigation and posts a public reply. Mon receives the reply and alert live. Mon replies; George sees the conversation update.
5. George adds an internal note. Mon receives neither its contents nor an internal alert. George requests escalation; Jayr acknowledges it.
6. George resolves with a summary. Mon receives the resolution alert and confirms or reopens. Reopening preserves the completed SLA cycle and starts another under the enabled policy.
7. Jayr filters Reports by date/agent/status and exports each CSV. Edit a policy in Settings and verify existing deadlines remain unchanged.
8. Change notification preferences, mark alerts read, reload, and confirm persistence. Disconnect/reconnect a browser and verify refreshed state. Use isolated test databases for shortened deadline experiments.

## Validation and deployment boundaries

```powershell
npm test
npm run test:postgres
npm run test:e2e:postgres
npm run typecheck
npm run lint
npm run build
npm run format:check
```

Native tests create and retain separate local test databases. Browser tests use separate ports, temporary file storage, generated credentials and multiple independent sessions. See [verification](verification.md) for actual results.

Phase 5 must supply a persistent Node backend and WebSocket-capable proxy. This implementation uses one Socket.IO process; horizontal scaling needs a shared adapter/event fan-out strategy so the worker's broadcasts reach sockets on every instance. PostgreSQL locking already protects duplicate worker outcomes, but it does not distribute in-memory socket delivery. Do not deploy the current worker as a serverless request handler. Production still requires onboarding/recovery, strong account credentials, backups, TLS/proxy/cookie validation, monitoring, retention and capacity testing. Outbox/notification retention, other timezones, split shifts, SLA pauses, scheduled exports and email remain unimplemented. No deployment or cloud migration is performed here.

The report agent selector currently lists the first 100 agents; the validated API accepts any agent UUID. Report/export results are deliberately bounded as described above. Full performance/load testing and physical database failover are Phase 5 validation tasks. The local worker retries database failures and reconciles durable pending work, but this does not establish a production recovery-time guarantee.

Socket integration follows the official [middleware](https://socket.io/docs/v4/middlewares/) and [server API](https://socket.io/docs/v4/server-api/) contracts. ResolveDesk uses REST resynchronization rather than replaying cached authorization-sensitive packets.
