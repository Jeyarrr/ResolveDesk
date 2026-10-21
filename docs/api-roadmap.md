# Implemented REST API

Base path: /api. Success: { success: true, data: ... }. Error: { success: false, error: { message } }. No stack traces or SQL are returned.

Cookie authentication is required except health, CSRF bootstrap, and login. Mutations require JSON, exact Origin, and X-CSRF-Token. Standard responses: 200, 201 created, 400 invalid input, 401 authentication, 403 permission/CSRF, 404 missing/inaccessible object, 409 conflict, 413 oversized body, 415 media type, 429 login throttle, 500 generic failure.

## Endpoints

| Method    | Path                   | Purpose                                        |
| --------- | ---------------------- | ---------------------------------------------- |
| GET       | /health                | Database connectivity check                    |
| GET       | /auth/csrf             | Pre-login CSRF bootstrap                       |
| POST      | /auth/login            | email, password, remember                      |
| GET       | /auth/me               | Safe current profile + session CSRF            |
| POST      | /auth/logout           | Revoke current session                         |
| GET       | /tickets               | Authorized, filtered page                      |
| POST      | /tickets               | subject, description, categoryId, priority     |
| GET       | /tickets/:id           | Authorized ticket with safe requester/assignee |
| PATCH     | /tickets/:id           | Admin subject/description/categoryId/priority  |
| PATCH     | /tickets/:id/status    | status, transition rules apply                 |
| PATCH     | /tickets/:id/assign    | Admin assignedAgentId UUID or null             |
| GET/POST  | /tickets/:id/comments  | List or add message, isInternal                |
| GET       | /tickets/:id/activity  | Authorized chronological history               |
| GET/POST  | /users                 | Admin page or create inactive account          |
| GET/PATCH | /users/:id             | Admin profile or allowed account fields        |
| GET/POST  | /departments           | Read references / admin create                 |
| PATCH     | /departments/:id       | Admin name, description, active                |
| GET/POST  | /ticket-categories     | Read references / admin create                 |
| PATCH     | /ticket-categories/:id | Admin name, description, active                |
| GET       | /analytics/dashboard   | Role-scoped aggregates, trends, recent tickets |

## Parameters

Ticket listing: page (1+), limit (1–100, default 20), search (max 120), status, priority, category (UUID), sort (recent/oldest/priority/subject), mine (true/false). Employee/agent scope is always enforced. Admin mine=true selects their own requests. Response data contains items, total, page, limit.

User listing: page, limit, search (name/email), role, accountStatus. Creation/edit fields: fullName, email, departmentId (UUID/null), role, accountStatus. Creation cannot activate an unprovisioned account; passwords are never accepted or returned by these endpoints.

Reference fields: name, description, active. Non-admin lists show active entries only. Archival does not delete existing links.

Analytics: days (1–90, default 14), period (false default). period=true limits cohort metrics to tickets created in that UTC range. Volume series separately counts creation/resolution events in the range. Administrator agent workload shows the top 20 agents. SLA is null. Current aggregate queries may observe concurrent committed updates between statements; analytics are not an accounting snapshot.

Comments/history are ordered oldest-first with stable UUID tie breaks. Their complete history is currently returned; cursor pagination for very long conversations is a future scaling task.

## Input bounds

Subjects 5–120 characters; descriptions 20–5000; comments 1–5000. Names, emails, searches, UUIDs, enums, booleans, pagination, and editable fields are validated using strict Zod schemas. Whitespace-only comments fail. Queries use parameterized Drizzle SQL; search wildcard characters are escaped.
