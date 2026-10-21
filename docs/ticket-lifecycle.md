# Ticket lifecycle

| Current status | Allowed next statuses |
| -------------- | --------------------- |
| open           | in_progress, pending  |
| in_progress    | pending, resolved     |
| pending        | in_progress, resolved |
| resolved       | closed, open          |
| closed         | open                  |

Only assigned agents and administrators change status. Employees communicate via public replies. A direct open-to-closed or repeated identical transition is rejected with 409. New requests start open and unassigned. Admins assign only eligible active agents.

Resolving sets resolved_at. Closing preserves resolved_at and sets closed_at. Reopening clears both timestamps and records Ticket reopened. Database constraints independently enforce timestamp/status consistency. The average resolution metric describes the latest completed lifecycle; historical reopen-cycle metrics are deferred.

Ticket creation, assignment, edits, status updates, and comments each use transactions. Ticket row locks serialize changes, and activity writes commit or roll back with their corresponding change. Comment activity never stores the message body. Internal-note activity is marked internal and filtered for employees.

Ticket details can be edited by administrators. Ownership is immutable through these APIs. No hard delete API exists. Reference archival preserves history. All priority levels—low, medium, high, critical—are independent of status.
