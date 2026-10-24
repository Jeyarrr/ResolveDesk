# Implemented REST API

Base path: /api. Success: { success: true, data: ... }. Error: { success: false, error: { message } }. No stack traces or SQL are returned.

Cookie authentication is required except health, CSRF bootstrap, and login. Mutations require exact Origin and X-CSRF-Token. Bodies use JSON except ticket creation, comments and attachment uploads, which also accept bounded multipart/form-data. Standard responses: 200, 201 created, 400 invalid input, 401 authentication, 403 permission/CSRF, 404 missing/inaccessible object, 409 conflict, 413 oversized body, 415 media type, 429 login/upload throttle, 500 generic failure.

## Phase 3 attachment and collaboration endpoints

See [payloads, visibility and retry behavior](attachments-conversations.md#api-contracts). Existing ticket and comment routes support atomic multipart submissions; no duplicate messaging API was introduced.

| Method       | Path                            | Purpose                                       |
| ------------ | ------------------------------- | --------------------------------------------- |
| GET          | /attachment-limits              | Configured upload limits                      |
| GET/POST     | /tickets/:id/attachments        | Scoped metadata / add files                   |
| GET          | /attachments/:id/download       | Private authenticated download                |
| DELETE       | /attachments/:id                | Uploader/admin soft deletion and disk cleanup |
| GET          | /tickets/:id/conversation-state | Visible unread count and read positions       |
| POST         | /tickets/:id/read               | Advance current user read position            |
| GET/POST     | /response-templates             | Support template search / creation            |
| PATCH/DELETE | /response-templates/:id         | Owner/admin edit or archive                   |

## Endpoints

Phase 3.2 adds `GET /users/workloads`, `GET /escalations`, `GET/POST /tickets/:id/escalations`, and `PATCH /escalations/:id/acknowledge` / `/resolve`. Existing assignment accepts `assignedAgentId`, assignment `expectedVersion` and a required reassignment `reason`; ticket lists accept `unassigned=true`. See [payloads, roles, pagination and concurrency](assignment-escalation.md#apis). All paths below use the `/api` prefix.

| Method    | Path                            | Purpose                                         |
| --------- | ------------------------------- | ----------------------------------------------- |
| GET       | /health                         | Database connectivity check                     |
| GET       | /auth/csrf                      | Pre-login CSRF bootstrap                        |
| POST      | /auth/login                     | email, password, remember                       |
| GET       | /auth/me                        | Safe current profile + session CSRF             |
| POST      | /auth/logout                    | Revoke current session                          |
| GET       | /tickets                        | Authorized, filtered page                       |
| POST      | /tickets                        | subject, description, categoryId, priority      |
| GET       | /tickets/:id                    | Authorized ticket with safe requester/assignee  |
| PATCH     | /tickets/:id                    | Admin subject/description/categoryId/priority   |
| PATCH     | /tickets/:id/status             | Active support status; optional expectedVersion |
| PATCH     | /tickets/:id/resolve            | Assigned agent/admin: summary, expectedVersion  |
| PATCH     | /tickets/:id/confirm-resolution | Owning employee: expectedVersion                |
| PATCH     | /tickets/:id/close              | Administrator: reason, expectedVersion          |
| PATCH     | /tickets/:id/reopen             | Eligible viewer: reason, expectedVersion        |
| PATCH     | /tickets/:id/assign             | Admin assignment with version and reason        |
| GET/POST  | /tickets/:id/comments           | List or add message, isInternal                 |
| GET       | /tickets/:id/activity           | Authorized chronological history                |
| GET/POST  | /users                          | Admin page or create inactive account           |
| GET/PATCH | /users/:id                      | Admin profile or allowed account fields         |
| GET/POST  | /departments                    | Read references / admin create                  |
| PATCH     | /departments/:id                | Admin name, description, active                 |
| GET/POST  | /ticket-categories              | Read references / admin create                  |
| PATCH     | /ticket-categories/:id          | Admin name, description, active                 |
| GET       | /analytics/dashboard            | Role-scoped aggregates, trends, recent tickets  |

## Parameters

Ticket listing: page (1+), limit (1–100, default 20), search (max 120), status, priority, category (UUID), sort (recent/oldest/priority/subject), mine (true/false). Employee/agent scope is always enforced. Admin mine=true selects their own requests. Response data contains items, total, page, limit.

User listing: page, limit, search (name/email), role, accountStatus. Creation/edit fields: fullName, email, departmentId (UUID/null), role, accountStatus. Creation cannot activate an unprovisioned account; passwords are never accepted or returned by these endpoints.

Reference fields: name, description, active. Non-admin lists show active entries only. Archival does not delete existing links.

Legacy dashboard analytics: days (1–90, default 14), period (false default). period=true limits cohort metrics to tickets created in that UTC range. Volume series separately counts creation/resolution events in the range. The existing dashboard performance summary shows the top 20 agents; the separate Phase 3.2 workload API paginates all active agents. Its legacy SLA field remains null. These legacy aggregate queries may observe concurrent committed updates between statements. Phase 4 reports use a repeatable-read snapshot and separate SLA endpoints.

## Phase 4 operations APIs

See the [complete endpoint contracts and reporting filters](phase4-operations.md#api-additions) for notifications, preferences, ticket SLA cycles, SLA overview/policies, advanced analytics and four CSV exports. These extend the existing router and session/CSRF middleware. Notification reads enforce ownership and current ticket access; reporting and policy configuration require administrator access. No API returns raw internal-note content through notifications or exports.

Comments/history are ordered oldest-first with stable tie breaks. Lifecycle events include `explanation` and `lifecycleVersion`; activity ties use lifecycle version then UUID. Their complete history is currently returned; cursor pagination for long conversations is future work.

## Phase 3.1 lifecycle payloads

`GET /tickets/:id` includes `lifecycleVersion`, `resolutionSummary`, `resolvedBy`, `closedBy`, safe `resolver`/`closer` profiles, the existing timestamps, and viewer-specific `lifecycleActions`. List responses include the resolution fields but do not include the viewer action map. Existing fields are retained.

Pass the version displayed when the action was opened:

```json
{ "expectedVersion": 1, "summary": "Replaced the adapter and verified stable connectivity." }
```

Resolution summaries require 20–5000 trimmed characters. Reopening and administrator closure use `reason` (10–2000 trimmed characters). Requester confirmation sends only `expectedVersion`. Bodies are strict; unknown fields or missing versions are rejected with 400.

The status endpoint accepts only permitted active transitions into `in_progress` or `pending`. Use the specific operation endpoints for resolution, confirmation, closure, or reopening; the generic route cannot bypass their validation. It accepts optional `expectedVersion` for older active-status clients, while the current UI always sends it. Versions are nonnegative integers.

Special actions require the appropriate role, ownership/assignment, and current state described in [ticket lifecycle](ticket-lifecycle.md). Only administrators can reopen a Closed ticket. A duplicate, stale version, or invalid transition returns 409 without an extra event. Resolution metadata, timestamps, version, and history commit in one transaction. Replies/internal notes retain their existing endpoints and visibility rules.

## Input bounds

Subjects 5–120 characters; descriptions 20–5000; comments 1–5000. Names, emails, searches, UUIDs, enums, booleans, pagination, and editable fields are validated using strict Zod schemas. Whitespace-only comments fail. Queries use parameterized Drizzle SQL; search wildcard characters are escaped.
