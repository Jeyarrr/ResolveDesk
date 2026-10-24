# Server permissions matrix

| Operation                                  | Employee                          | Agent                           | Administrator            |
| ------------------------------------------ | --------------------------------- | ------------------------------- | ------------------------ |
| List/read ticket                           | Own requests                      | Assigned only                   | All                      |
| Create ticket                              | Self                              | No                              | Self                     |
| Edit subject/description/category/priority | No                                | No                              | Yes                      |
| Assign/unassign agent                      | No                                | No                              | Yes                      |
| Reassign with reason                       | No                                | No                              | Active tickets only      |
| Request escalation                         | No                                | Assigned active ticket          | No                       |
| Read escalation history                    | No                                | Assigned only                   | All                      |
| Escalation queue / acknowledge / resolve   | No                                | No                              | Yes                      |
| Agent workload overview                    | No                                | No                              | Yes                      |
| Change allowed status                      | No                                | Assigned only                   | All                      |
| Resolve with public summary                | No                                | Assigned only                   | All eligible             |
| Confirm resolution and close               | Own resolved                      | No                              | Separate close action    |
| Close with recorded administrator reason   | No                                | No                              | Resolved only            |
| Reopen with public reason                  | Own resolved                      | Assigned resolved               | Resolved or closed       |
| Public replies/activity                    | Own                               | Assigned only                   | All                      |
| Read/write internal notes                  | No                                | Assigned only                   | All                      |
| User management                            | No                                | No                              | Yes                      |
| Read active departments/categories         | Yes                               | Yes                             | Yes; also archived       |
| Create/edit/archive references             | No                                | No                              | Yes                      |
| Analytics                                  | Own                               | Assigned                        | Organization             |
| Public attachments: list/upload/download   | Own requests                      | Assigned only                   | All                      |
| Internal attachments                       | No                                | Assigned only                   | All                      |
| Delete accessible attachment               | Own upload                        | Own upload, assigned ticket     | All                      |
| Read cursor                                | Own ticket and own cursor         | Assigned ticket and own cursor  | Own cursor on any ticket |
| Read/use/create saved replies              | No                                | Yes                             | Yes                      |
| Edit/archive saved replies                 | No                                | Own templates                   | All                      |
| Notifications and preferences              | Own, currently accessible tickets | Own, currently assigned tickets | Own notifications        |
| Ticket SLA cycles / overview               | Owned tickets                     | Assigned tickets                | All tickets              |
| SLA policy configuration                   | No                                | No                              | Yes                      |
| Advanced reports and CSV exports           | No                                | No                              | Yes                      |

Socket authentication reuses the same session and current role. Subscription checks and each event delivery recheck ticket access; expired/revoked sessions and role changes disconnect the socket. Employee events exclude internal notes, escalation details and restricted attachment metadata. Generic cache resynchronization clears a previous agent's stale ticket data after reassignment. Employee SLA responses omit aggregate agent timing metrics.

Authentication middleware checks the session and current active account. Role middleware protects administrator routes. Ticket queries and service methods enforce ownership/assignment independently. Unauthorized object reads use 404, avoiding disclosure of ticket existence. Unauthorized actions return 403. Unknown fields are rejected, including requesterId, role, and passwordHash where not explicitly allowed.

Employees never receive internal comment bodies, note flags, or internal-note activity entries. Safe ticket participant profiles include names/initials only; full account listing is administrator-only. Client-side guards improve navigation but are not security boundaries.

New assignment reasons and escalation audit entries are internal. Reassignment immediately transfers agent access without changing requester ownership. HR department membership grants no additional permission. Existing escalation history remains available to the new assigned agent and administrators.

Account role/status/email changes revoke sessions. The last active administrator cannot be demoted or deactivated; changes serialize under a database lock. Assigned agents must be active agents, and changing their role/status requires removing all assignments first. Existing archived categories/departments remain referenced by historical records.

Attachment visibility is enforced both on metadata and downloads, including the parent comment. Attaching to an existing comment requires authorship or administrator access and matching visibility. Reassignment removes old-agent access to files and conversations. Read cursors cannot target invisible or unrelated messages. Employee APIs exclude internal messages, files, activity and unread contributions. Saved replies never bypass normal comment validation.
