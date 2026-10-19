# ResolveDesk

A modern IT Help Desk & Ticket Management System designed to streamline technical support requests, ticket assignments, issue tracking, and resolution workflows.

ResolveDesk is a planned internal company IT support platform where employees can submit technical support tickets, IT personnel can manage and resolve issues, and administrators can oversee support operations.

## Development status

**Planning / repository initialization.** This repository currently contains project documentation and Git configuration only. The application, database schema, authentication, and features described below have not been implemented.

## Project objectives

- Centralize employee technical support requests in one accessible platform.
- Give IT support teams a clear process for triage, assignment, escalation, and resolution.
- Improve communication and visibility throughout a ticket's lifecycle.
- Help administrators monitor service quality, workloads, and SLA performance.
- Preserve support knowledge and ticket history to improve future resolutions.

## Planned core features

All features in this section are planned:

- **User roles:** Employee, IT Support, and Administrator.
- **Authentication and authorization:** Secure sign-in and role-based access to application features and data.
- **Ticket management:** Create, view, update, and resolve IT support tickets.
- **Ticket classification:** Track priority, category, and status.
- **Assignment and escalation:** Route tickets to support personnel and escalate issues as needed.
- **Conversations and notifications:** Real-time ticket discussions and updates.
- **Analytics and reporting:** Administrative dashboards for support operations.
- **SLA monitoring:** Track response and resolution targets.
- **Knowledge base:** Publish and discover IT support articles.
- **Activity history:** Record ticket changes and support actions.

## Planned technology stack

| Layer | Technology | Intended use |
| --- | --- | --- |
| Frontend | React and TypeScript | Role-aware web interface |
| Styling | Tailwind CSS | Responsive application styling |
| Backend runtime | Node.js | Server-side application runtime |
| API framework | Express.js and TypeScript | HTTP API, validation, and business logic |
| Database | PostgreSQL | Persistent application data |

Real-time transport, authentication approach, database access tooling, testing tools, and deployment infrastructure will be selected during implementation.

## Planned system architecture

The application is expected to use a client-server architecture:

```text
Employees / IT Support / Administrators
                  |
                  v
       React + TypeScript frontend
             Tailwind CSS
                  |
             HTTPS / API
                  |
                  v
    Node.js + Express.js + TypeScript
    Authentication and authorization
    Ticket workflows and validation
                  |
                  v
              PostgreSQL
```

The backend will enforce permissions and validate requests before accessing the database. Planned data areas include users and roles, tickets, assignments, conversations, SLA policies, knowledge articles, and activity history. Real-time conversations and notifications will extend this architecture once their transport is selected.

A proposed source layout is shown below. These directories have **not** been created:

```text
ResolveDesk/
  client/       # Planned React application
  server/       # Planned Express API
  docs/         # Planned architecture and development documentation
  README.md
  .gitignore
```

## Installation and setup

### Current repository

Git is the only requirement for working with the repository at this stage. Once the repository is published, copy its clone URL from GitHub:

```bash
git clone <repository-clone-url>
cd ResolveDesk
```

There are no package manifests, application commands, database migrations, or running services yet. Dependency installation and startup instructions will be added when the frontend and backend are scaffolded.

### Planned local development prerequisites

- A supported Node.js LTS release and a project-selected package manager.
- PostgreSQL, with its supported version documented during implementation.
- Local environment configuration for the API, database connection, and authentication.

Exact versions, environment variable names, migration commands, and development scripts will be documented as they are introduced. Future `.env.example` files must contain placeholders only; real credentials belong in ignored local environment files or the deployment environment's secret storage. Browser-delivered configuration must never contain secrets.

## Development workflow

- Use `main` as the default branch.
- Create focused branches for features, fixes, and documentation changes.
- Use descriptive commits and pull requests that explain the intended behavior.
- Commit source files and dependency lockfiles; exclude dependencies, generated outputs, and local secrets.

## Initial roadmap

- [x] Initialize the local Git repository and project documentation.
- [ ] Scaffold the frontend and backend applications.
- [ ] Design the database schema and migration workflow.
- [ ] Implement authentication and role-based authorization.
- [ ] Implement the ticket lifecycle and assignment workflows.
- [ ] Add conversations, notifications, and activity history.
- [ ] Add SLA monitoring, analytics, and the knowledge base.
- [ ] Document deployment and operational procedures.

## License

A license has not been selected. Public repository visibility alone does not grant permission to reuse, modify, or distribute the code.
