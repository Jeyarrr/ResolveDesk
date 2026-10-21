# Verification record

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
