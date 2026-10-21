# Ticket lifecycle — Phase 3.1

Lifecycle operations use the existing local PostgreSQL database, Express authentication, ticket scope, and activity table. George's Human Resources department does not grant additional access: he remains an assigned-ticket Agent.

## Transitions and permissions

| From                  | To                    | Operation                | Who                                               | Required information                       |
| --------------------- | --------------------- | ------------------------ | ------------------------------------------------- | ------------------------------------------ |
| Open                  | In progress / Pending | Change status            | Assigned agent or administrator                   | Target status                              |
| In progress           | Pending               | Change status            | Assigned agent or administrator                   | Target status                              |
| Pending               | In progress           | Resume investigation     | Assigned agent or administrator                   | Target status                              |
| In progress / Pending | Resolved              | Resolve                  | Assigned agent or administrator                   | Public summary, 20–5000 trimmed characters |
| Resolved              | Closed                | Confirm resolution       | Owning employee                                   | Explicit confirmation                      |
| Resolved              | Closed                | Administrative closure   | Administrator                                     | Public reason, 10–2000 trimmed characters  |
| Resolved              | Open                  | Reopen                   | Owning employee, assigned agent, or administrator | Public reason, 10–2000 trimmed characters  |
| Closed                | Open                  | Administrative reopening | Administrator only                                | Public reason, 10–2000 trimmed characters  |

Pending is an optional waiting state. Open cannot go directly to Resolved or Closed. Resolved cannot go directly to Pending or In progress; reopen it first. Closed cannot go directly to In progress. Agents cannot close tickets or confirm on behalf of requesters. The backend policy is centralized in `server/src/services/lifecycle.ts`; the detail API returns permitted actions for the current viewer.

## Resolution and confirmation

Resolution updates `resolved_at`, `resolved_by`, and `resolution_summary` in the same transaction as its activity entry. The summary is public to authorized ticket viewers, so sensitive investigation details belong in existing internal notes.

An employee reviews the summary and chooses **Confirm resolution** or **Issue still exists**. Confirming requires a dialog, closes the ticket, stores `closed_at` and `closed_by`, and records confirmation and closure as one atomic event. Administrator closure uses a separate audited action with a mandatory reason. No automatic closure timer exists.

## Reopening and history

Reopening returns the ticket to Open and keeps its requester, assignee, creation date, comments, and prior activity. Current `resolved_at`, `resolved_by`, `resolution_summary`, `closed_at`, and `closed_by` are cleared for the new attempt. Previous summaries remain in activity events with their original actor, time, and previous/new status. The reopening reason is another public event. The progress indicator resets rather than showing a completed resolution.

Existing pre-Phase-3.1 resolved tickets are retained. If no structured summary or resolving actor was stored, the UI directs users to their existing history; the migration does not invent that information. Their timestamps remain valid. No API permits editing or deleting lifecycle history.

## Concurrency and errors

Lifecycle mutations lock the ticket row in a transaction, recheck scope and status, and atomically append the audit event. Each change increments `lifecycle_version`. Resolution, confirmation, closure, and reopening require `expectedVersion` from the detail response. The active-status endpoint accepts it optionally for Phase 2 compatibility; the UI always sends it. A unique `(ticket_id, lifecycle_version)` activity index adds duplicate protection.

Stale versions, repeated actions, and invalid transitions return HTTP 409 without another history event. A stale confirmation from an earlier resolution attempt cannot confirm a later attempt. Malformed input returns 400, unauthenticated requests 401, forbidden actions 403, and inaccessible/missing tickets 404. CSRF and Origin validation apply to all mutations.

The UI disables actions during submission, preserves explanations after errors, refreshes protected queries after success or a 409, and keeps the dialog's original version to avoid silently submitting against a newer resolution.

## Lists and analytics

Existing lists, filters, sorting, and role-scoped SQL aggregates are reused. Reopened tickets return to Open queues. Status distributions distinguish Resolved and Closed; the dashboard's combined resolved metric includes both. Resolution-time averages and daily resolution series describe the latest completed attempt, not historical-cycle metrics. Complete attempt history is available in the timeline.

## Manual walkthrough

1. Mon creates a ticket and signs out.
2. Jayr assigns it to George and signs out.
3. George changes it to In progress, chooses **Mark as resolved**, and submits a resolution summary.
4. Mon reviews the summary, chooses **Issue still exists**, and supplies a reason. Refresh and verify that the previous summary remains in the timeline.
5. George resumes investigation and resolves it again with another summary.
6. Mon chooses **Confirm resolution** and confirms the dialog. The ticket becomes Closed; both resolution attempts remain visible.
7. Only Jayr can reopen that closed ticket, using a recorded reason. Neither Mon nor George should see that action.

Use a dedicated test ticket for this walkthrough. Automated write tests run in isolated databases, never the configured application database.

## Limits

No reassignment redesign, escalation, attachments, threaded conversations, real-time notifications, SLA automation, scheduled closure, or new roles are introduced. Activity pagination and historical-cycle analytics remain future work. Existing authentication, comments, admin edits, assignments, and reference management remain in place.
