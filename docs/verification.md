# Verification record

## Phase 3.2 — October 22, 2026

Implemented assignment/reassignment, separate escalation records and an administrator queue, and paginated SQL-backed active-agent workloads. The existing local PostgreSQL configuration and Phase 3.1 lifecycle service are retained.

| Check                             | Result                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| Default Vitest suite              | 101 passed, 1 native-only test skipped; 13 files passed                                         |
| Native PostgreSQL suites          | 27 passed: 12 lifecycle and 15 assignment/escalation/workload tests                             |
| Native PostgreSQL Playwright      | 5 passed, including assignment/escalation and the full lifecycle workflow                       |
| Accessibility / responsive layout | Axe checks passed, including the new administrator page; widths 1024, 768, 390 and 320px passed |
| Formatting                        | Prettier check passed                                                                           |
| TypeScript                        | Client, server and tooling passed                                                               |
| ESLint                            | Passed                                                                                          |
| Production build                  | Client and server passed                                                                        |
| Migration generation              | No schema drift after migrations 0003 and 0004                                                  |
| Application data preservation     | All original column values and counts match the pre-migration snapshot                          |
| Local environment                 | Existing server/.env bytes unchanged                                                            |
| Credential scan                   | 139 publishable files checked; no actual database URL, session secret or private key found      |

The reviewed additive migrations were applied locally: `0003_gray_mysterio.sql` adds assignment versions; `0004_tricky_zzzax.sql` adds escalation records, constraints and indexes. Before/after verification preserved 4 users, 6 departments, 7 categories, 1 ticket, 2 comments, 4 activity entries and 8 sessions. No pre-existing values changed, including password hashes, account IDs, roles, departments, ticket relationships or session records. George remains an agent in Human Resources. The new escalation table was empty after migration; integration writes used isolated test databases.

Coverage includes eligible/ineligible assignment, required reassignment reasons, audit history, ownership/lifecycle preservation, transfer of agent access, stale and duplicate changes, concurrent assignment/escalation requests, database uniqueness, escalation acknowledgement/resolution, private history, SQL workload totals across all five statuses, pagination, and role restrictions. UI tests cover workload display, reason validation, explicit confirmation, cancellation, captured versions and keyboard dismissal.

The native runner creates one fresh local test database per suite because development seeding intentionally preserves existing password hashes. This prevents separately generated test credentials from colliding. Databases are retained in pgAdmin for inspection. Vitest workers are capped at two to avoid excessive concurrent PGlite/jsdom resource use on local development machines.

Manual demo instructions and API contracts are in [Assignment, escalation and workload management](assignment-escalation.md). Known limits: assignment is manual, workload counts are advisory, other browser sessions refresh on focus/reload, and assignment history displays the agents' current names. Attachments, advanced conversations, live notifications/SLA automation and deployment remain later milestones. No Git commit or push was performed.

## Phase 3.1 — October 22, 2026

Validated against the existing local PostgreSQL installation. No Neon configuration, synchronization, deployment, commit, or push was performed.

| Check                              | Result                                                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default Vitest suite               | 82 passed, 1 native-only test skipped; 11 files passed                                                                                                                     |
| Native PostgreSQL lifecycle suite  | 12 passed, including the multi-connection test skipped by PGlite                                                                                                           |
| Native PostgreSQL Playwright suite | 5 passed, including full resolve/reopen/re-resolve/confirm workflow, refresh persistence, mobile layout, existing authentication, administration, and accessibility checks |
| TypeScript                         | Client, server, and tooling passed                                                                                                                                         |
| ESLint                             | Passed                                                                                                                                                                     |
| Production build                   | Client and server passed                                                                                                                                                   |
| Migration generation               | No schema drift after `0002_sticky_garia.sql`                                                                                                                              |
| Application data preservation      | Before/after comparison of every original column matched for users, departments, tickets, comments, activity, and sessions                                                 |
| Local environment                  | Existing `server/.env` bytes unchanged; local database and `DB_SSL=false` preserved                                                                                        |

The additive migration was reviewed and applied to the existing local database. Its pre-migration records remained intact: 4 users, 6 departments, 1 ticket, 2 comments, 4 activity entries, and 7 sessions. Jayr/admin/Administration, George/agent/Human Resources, and Mon/employee/General retained their IDs, usernames, email addresses, password hashes, roles, and relationships. Automated lifecycle writes used separate local `resolvedesk_test_*` databases, retained for inspection in pgAdmin.

Targeted checks cover required summaries/reasons, actor/ownership restrictions, unassigned agents, authentication and CSRF, active transitions, requester confirmation, administrator-only closed-ticket reopening, repeated submissions, stale versions across resolution cycles, competing updates, rollback on audit failure, internal-note privacy, queue/analytics counts, and preserved history. Frontend tests cover authorized controls, dialogs/cancel, validation, conflicts, pending states, and captured versions. Existing regression tests were adapted to the explicit lifecycle operations.

The default suite intentionally skips its native connection test because PGlite has one connection; the native suite runs it with distinct PostgreSQL backend connections and a held ticket row lock. A simulated-typing timeout in one UI test was removed by pasting the same text; the complete suite subsequently passed.

Known limits: legacy resolved tickets may lack a structured summary/actor; no historical values are fabricated. Analytics measure the latest completed attempt. Hosted TLS, deployment cookies/proxies, automatic closure, escalation, attachments, advanced conversations, and real-time/SLA features remain outside this milestone.

## Phase 2 — historical handoff

Verified locally on October 21, 2026. No deployment, Git commit, push, or external database mutation was performed.

| Check                   | Result                                                                     |
| ----------------------- | -------------------------------------------------------------------------- |
| Vitest                  | 63 tests passed across 8 files                                             |
| Playwright              | 5 browser tests passed                                                     |
| Accessibility           | Axe checks on login, dashboard, ticket form, and team page passed          |
| Responsive layouts      | Checked at 1024, 768, 390, and 320 pixels                                  |
| TypeScript              | Client, server, and tooling passed                                         |
| ESLint                  | Passed without warnings                                                    |
| Production build        | Client and server passed                                                   |
| Formatting              | Prettier check passed                                                      |
| Migration generation    | No schema drift after generating the initial migration                     |
| Dependency audit        | No known vulnerabilities reported by npm audit                             |
| Repository review       | Existing main branch/remote preserved; git diff --check passed             |
| Credential-pattern scan | No matches in publishable source; environment/build/test artifacts ignored |

## Exercised workflows

- Login, generic failures, logout/revocation, expiry, inactive/suspended users, session rotation, production cookie attributes, CSRF/origin validation, and login throttling.
- Employee ownership, agent assignment scope, administrator permissions, mass-assignment rejection, internal-note/activity privacy, and role-escalation rejection.
- Ticket creation, retrieval, edits, assignment eligibility, valid/invalid status transitions, replies, history, and real aggregate statistics.
- Account provisioning state, last-active-admin protection, agent deactivation safeguards, department/category creation and archival.
- Case-insensitive uniqueness, foreign keys, rollback, repeated migrations, and persistence after reopening a disk-backed database.
- Browser session restoration, multi-role ticket workflow, database persistence across reloads, account creation, reports, appearance, mobile navigation, and static knowledge guides.

## Test isolation and remaining verification

Tests use PGlite, an isolated PostgreSQL engine. They do not read an external DATABASE_URL, do not reset Neon, and generate temporary test passwords. The production application uses node-postgres with verified TLS and a bounded pool; PGlite is excluded from its build.

No server/.env, DATABASE_URL, or SESSION_SECRET was configured at handoff. Consequently, live Neon connectivity, TLS, pooled migrations, and production runtime behavior remain unverified. PGlite serializes queries on one connection; tests cannot prove multi-connection contention behavior. Verify the last-admin and assignment locks with separate connections on a dedicated Neon development branch.

Hosted cross-origin cookies, browser privacy restrictions, reverse-proxy trust, shared throttling across replicas, production onboarding/recovery, backups, and operational monitoring require a later deployment validation pass. Notification delivery, uploads, SLA automation, and the knowledge backend remain explicitly deferred.
