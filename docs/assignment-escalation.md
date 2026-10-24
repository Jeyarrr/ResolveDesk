# Assignment, escalation and workload management

## Assignment rules

Administrators use **Assign ticket** or **Reassign ticket** on ticket details. The dialog lists active agents, displays the selected agent's department and workload, and requires explicit confirmation. Reassignment (including returning a ticket to Unassigned) requires a trimmed reason of 10–2,000 characters. Initial assignment can omit the reason. Inactive, suspended, unknown and non-agent accounts are rejected.

Only open, in-progress and pending tickets can change assignment. Reopen a resolved or closed ticket through the existing lifecycle workflow first. Assignment never resets status, resolution records, requester ownership, comments or history. The former agent immediately loses API access; the new agent gains access under the existing assigned-only rule. Departments do not grant ticket access.

`PATCH /api/tickets/:id/assign` accepts:

```json
{
  "assignedAgentId": "eligible-agent-uuid",
  "expectedVersion": 1,
  "reason": "Transfer to the specialist covering this support request."
}
```

Use the ticket's **assignmentVersion**, not lifecycleVersion. `assignedAgentId: null` returns a ticket to the unassigned queue. Omitted expectedVersion defaults to zero for compatibility with initial seed/Phase 2 assignment calls; it cannot overwrite a subsequent assignment. Migrated tickets start at zero, including existing assigned tickets. Once an assignment changes, callers must send its current version. The dialog captures the version when opened. Stale requests and duplicate assignments return 409; reopen the dialog after reviewing refreshed data.

The service locks the eligible user before locking the ticket, matching account administration's lock order. The update and audit insert share one transaction. Activity records store old/new agent IDs, administrator, reason and timestamp. Staff see names resolved from those IDs; renamed users display their current names. New assignment reasons/history entries are internal to support staff. Existing public historical records are preserved unchanged.

Administrators can combine **Unassigned** with existing ticket filters. This filter includes all lifecycle statuses; completed tickets remain protected from assignment changes.

## Escalation rules

An assigned active agent can request administrator attention on an open, in-progress or pending ticket, with a trimmed 10–2,000-character reason. Employees and administrators cannot create agent escalation requests. Unrelated agents receive 404. The service checks access while holding the ticket lock.

Escalation has its own states:

| Current state        | Administrator operation | Next state   |
| -------------------- | ----------------------- | ------------ |
| open                 | Acknowledge             | acknowledged |
| open or acknowledged | Resolve escalation      | resolved     |

Both operations require the displayed `expectedStatus`. A stale or duplicate operation returns 409. Resolving directly from open is allowed; acknowledgement fields remain null. An administrator may handle an existing escalation after the ticket itself is resolved or closed. No escalation operation changes the ticket's lifecycle or resolution metadata. Resolving a ticket does not automatically resolve its escalation.

Only one open/acknowledged escalation can exist per ticket, enforced by a partial unique index and serialized ticket transactions. After it is resolved, an eligible agent can request another escalation. Earlier requests remain in history. Reassignment preserves active escalation and history, transfers visibility to the newly assigned agent, and removes the old agent's access.

Escalation reasons, actors and timestamps are available to the current assigned agent and administrators only. Escalation audit entries are internal; employees cannot access them through history, queue or escalation endpoints. The administrator queue includes ticket number, subject, priority, lifecycle status, current assignee, reason, request time and escalation state. **View ticket / reassign** opens the existing assignment workflow.

## APIs

All paths have `/api` prefix and require a current authenticated session. Mutations also require existing CSRF and origin checks. Responses retain `{ success, data }` envelopes.

| Method | Path                         | Authorization / input                                       |
| ------ | ---------------------------- | ----------------------------------------------------------- |
| PATCH  | /tickets/:id/assign          | Admin; assignedAgentId, expectedVersion, conditional reason |
| GET    | /tickets                     | Existing scope; optional unassigned=true                    |
| GET    | /users/workloads             | Admin; page, limit, search by agent name                    |
| POST   | /tickets/:id/escalations     | Assigned agent; reason; returns 201                         |
| GET    | /tickets/:id/escalations     | Assigned agent/admin; page, limit, search, state            |
| GET    | /escalations                 | Admin; page, limit, search by subject/number, state         |
| PATCH  | /escalations/:id/acknowledge | Admin; expectedStatus: open                                 |
| PATCH  | /escalations/:id/resolve     | Admin; expectedStatus: open or acknowledged                 |

Lists return `items, total, page, limit`; limit defaults to 20 and is capped at 100. Escalation `state` is active (default), resolved or all. Ticket details request all states for paginated history and active state separately for current status. Workloads and escalation pages are paginated. Unknown request fields are rejected.

## Workload definitions

**Escalations & Workload** lists every active agent, including zero-ticket agents, with department and SQL aggregates of current assignment:

- Total: all assigned tickets, including resolved and closed.
- Open, In progress, Pending, Resolved, Closed: each exact status, counted separately.
- Active work: open + in progress + pending.

Counts have no date filter and reflect reassignment after commit. They are guidance for manual assignment, not reservations or guaranteed availability. Paginated rows and total count are separate reads, so concurrent updates can change the next refresh. Existing dashboard performance aggregates retain their prior definitions and top-20 scope.

TanStack Query invalidates protected data after mutations and conflicts. Other browser sessions refresh on window focus or page reload; live push notifications and automatic balancing are outside this phase.

## Migrations and preservation

- `0003_gray_mysterio.sql`: nonnegative `tickets.assignment_version`, default zero.
- `0004_tricky_zzzax.sql`: `ticket_escalations`, restricted foreign keys, reason/state consistency checks, one-active-per-ticket uniqueness, state/date and ticket/date indexes.

Neither migration updates existing account credentials, roles, departments, ticket links or lifecycle fields. No resets, reseeding, cloud configuration or new ticket status are introduced. Keep the existing local `DATABASE_URL`, `DB_SSL=false` and session secret.

## Manual walkthrough

1. As Mon (`monmon`), create a ticket. Confirm administrative workload/escalation controls are absent.
2. As Jayr (`jear`), open All Tickets → Unassigned, select the ticket and **Assign ticket**. Choose George, review his HR department and counts, then confirm.
3. As George (`geor`), open the assigned ticket and **Escalate ticket**. Enter an administrator attention reason and confirm. A second active request is unavailable.
4. As Jayr, open **Escalations & Workload**, find the request and acknowledge it. Open its ticket to inspect history or reassign with a reason. Resolve the escalation separately when handled.
5. To try reassignment without provisioning another local agent, return the ticket to Unassigned with a reason, then assign George again. Native integration tests cover transfer between two distinct agents in isolated databases.
6. Confirm ticket status stayed unchanged and history persists after reload. Continue the Phase 3.1 resolution, employee confirmation and reopening workflow.

Only perform these intentional demo writes on tickets you choose. Automated integration/browser tests use separate local test databases. See [attachments and conversations](attachments-conversations.md) and [Phase 4 live notifications/SLA automation](phase4-operations.md) for the integrated additions. Deployment remains Phase 5 work.
