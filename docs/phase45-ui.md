# Phase 4.5: Analytics interface

ResolveDesk uses a shared dark-first visual system across dashboards, reports, tickets, notifications, authentication, and settings. Existing APIs, authorization, accounts, database records, and ticket workflows remain the source of truth.

## Design system

| Token          | Dark theme | Purpose                                   |
| -------------- | ---------- | ----------------------------------------- |
| Background     | `#0B0D13`  | Application canvas                        |
| Sidebar        | `#10131B`  | Navigation                                |
| Card           | `#151924`  | Analytics and content panels              |
| Elevated       | `#1B2030`  | Menus and secondary surfaces              |
| Brand          | `#8B5CF6`  | Charts and active navigation              |
| Highlight      | `#A78BFA`  | Links and focus indicators                |
| Primary button | `#7C3AED`  | White-text actions with stronger contrast |
| Success        | `#22C55E`  | Resolved series and success indicators    |

Tokens live in `client/src/styles/globals.css`. Light mode uses the same component hierarchy with light surfaces and darker text. Status and priority charts use semantic colors independent of result ordering. Critical is red, high orange, medium blue, and low green.

## Reusable components and layouts

- `MetricCard` supports optional, labeled sparklines using supplied history. Missing history produces a static card; zero history remains flat.
- `Card`, `PageHeader`, `Button`, `Logo`, `Loading`, and the application shell share typography, spacing, surfaces, and focus treatments.
- Dashboard and reporting panels use a twelve-column grid, wider volume charts, and narrower distributions. Seven administrator KPIs reflow into four plus three cards on smaller desktops and one row on wide displays.
- `DistributionChart` shows actual counts and rounded percentages. Its keyboard-operable legend highlights a segment without changing totals. Rounded percentages may not sum to exactly 100%.
- Charts use unique gradient IDs, theme-aware labels, tooltips, and textual summaries. Chart animation is disabled; subtle page/card motion respects reduced-motion preferences.
- SLA summaries show server-provided compliance and measurements with a compact gauge. Missing measurements are shown explicitly. Deadline lists remain bounded and scrollable.
- Reports retain every filter and all four exports. Headline KPIs precede the charts; detailed cohort measurements are available in an expandable section.
- Ticket details place conversations, attachments, and history alongside ticket properties and SLA targets on desktop. Forms, internal notes, notification states, and table rows follow the same visual system.
- Ticket tables have labeled, keyboard-focusable horizontal scrolling regions on narrow screens.

## Role-specific presentation

- **Administrator:** organization ticket volume, status, priority, seven KPIs, SLA operations, agent workload, recent tickets, and activity. A reports link exposes detailed agent SLA and response measurements. Counts are not presented as an employee ranking.
- **Agent:** assigned workload, critical/pending/resolved tickets, resolution trends, priority distribution, service targets, queue, and recent assignment/reply/escalation notifications.
- **Employee:** personal ticket counts, active requests, quick ticket creation, knowledge guides, personal service targets, ticket activity, and support notifications.

All data continues through the existing role-scoped APIs and query keys. Dashboard history covers the selected chart range; ticket counts cover the accessible ticket set. SLA compliance covers completed tracked cycles, not all tickets. Report metrics follow the existing date/filter cohort definitions.

## Review and verification

The browser regression suite exercises the existing ticket workflow with separate employee, agent, and administrator sessions. Responsive checks cover 375, 430, 768, 1024, 1366, and 1920 pixels. It also captures dashboard screenshots under ignored `tmp/phase45-*.png` files. Existing report/conversation screenshots are refreshed by their regression scenarios.

Run:

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e:postgres
npm run build
npm run format:check
```

The PostgreSQL browser runner creates a separate test database and retains it for inspection. It does not seed or modify the application's existing database.

### Results — October 25, 2026

| Check                         | Result                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                    | Client, server, and tooling checks passed                                                                                                                                 |
| Lint                          | Passed with no warnings                                                                                                                                                   |
| Unit/API suite                | 140 passed; one existing native PostgreSQL row-lock concurrency test skipped in the default PGlite suite                                                                  |
| Full PostgreSQL browser suite | All six scenarios passed                                                                                                                                                  |
| Focused UI follow-up          | Passed all six viewport widths, role dashboards, legend interaction, and all four CSV download buttons                                                                    |
| Accessibility                 | No automated WCAG A/AA violations in scanned login, dashboard, form, team, escalation, reporting, notification, and settings screens; dark and light report checks passed |
| Production builds             | Client and server builds passed                                                                                                                                           |
| Formatting                    | Passed                                                                                                                                                                    |

Browser scenarios cover login/session persistence, role guards, ticket creation, reassignment, escalation, public replies, private notes, attachments, resolution/confirmation/reopening, live notifications, reconnect synchronization, SLA cycle display, reporting, and settings navigation. Screenshots were visually reviewed for dashboards, login, settings, reports, and ticket detail. The dedicated native row-lock test was not rerun in this frontend phase.

No dependencies were added. Existing route splitting is retained, sparklines use small SVGs, and chart animations remain disabled. Automated accessibility checks do not replace a full assistive-technology audit.

## Limits and deployment readiness

- Sparse real data produces sparse charts. No demo trends or fabricated statistics are injected into live screens.
- Support updates show the latest five notifications, subject to existing notification preferences. Full notification history remains on the notifications page.
- Knowledge guides remain samples; the knowledge base backend is still planned.
- Wide tables scroll horizontally on mobile. Agent workload charts retain the existing twenty-agent limit.
- This phase prepares the frontend for deployment review. Phase 5 still needs its own production configuration, credential, storage, database, and hosting work. No deployment, cloud configuration, migration, commit, or push is performed by this UI phase.

Suggested commit message:

```text
feat: implement premium analytics UI redesign for ResolveDesk
```
