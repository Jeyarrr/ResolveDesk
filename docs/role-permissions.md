# Server permissions matrix

| Operation                                  | Employee     | Agent         | Administrator      |
| ------------------------------------------ | ------------ | ------------- | ------------------ |
| List/read ticket                           | Own requests | Assigned only | All                |
| Create ticket                              | Self         | No            | Self               |
| Edit subject/description/category/priority | No           | No            | Yes                |
| Assign/unassign agent                      | No           | No            | Yes                |
| Change allowed status                      | No           | Assigned only | All                |
| Public replies/activity                    | Own          | Assigned only | All                |
| Read/write internal notes                  | No           | Assigned only | All                |
| User management                            | No           | No            | Yes                |
| Read active departments/categories         | Yes          | Yes           | Yes; also archived |
| Create/edit/archive references             | No           | No            | Yes                |
| Analytics                                  | Own          | Assigned      | Organization       |

Authentication middleware checks the session and current active account. Role middleware protects administrator routes. Ticket queries and service methods enforce ownership/assignment independently. Unauthorized object reads use 404, avoiding disclosure of ticket existence. Unauthorized actions return 403. Unknown fields are rejected, including requesterId, role, and passwordHash where not explicitly allowed.

Employees never receive internal comment bodies, note flags, or internal-note activity entries. Safe ticket participant profiles include names/initials only; full account listing is administrator-only. Client-side guards improve navigation but are not security boundaries.

Account role/status/email changes revoke sessions. The last active administrator cannot be demoted or deactivated; changes serialize under a database lock. Assigned agents must be active agents, and changing their role/status requires removing all assignments first. Existing archived categories/departments remain referenced by historical records.
