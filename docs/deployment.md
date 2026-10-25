# Deploy ResolveDesk to Vercel and Neon

## Current deployment

- Live demo: https://resolvedesk-iota.vercel.app
- Vercel project: `resolvedesk` in `jayr-portfolio`; API region: Singapore (`sin1`).
- Neon project: `ResolveDesk`, production branch, Singapore.
- Attachments: private Vercel Blob store `resolvedesk-files`.
- Cloud database migrations and the three documented demo identities are initialized. Local tickets, sessions, and uploads were not copied.
- Hobby runs the scheduled SLA job daily; active sessions also trigger the shared worker through polling. An external scheduler is still needed for timely unattended SLA processing.

## Prepared architecture

One Vercel project serves the React frontend and Express API at the same origin. Neon stores PostgreSQL data; a **private Vercel Blob store** holds attachments. Code preparation does not create cloud resources, copy local data, or publish a site.

| Component      | Local                   | Vercel                                              |
| -------------- | ----------------------- | --------------------------------------------------- |
| Frontend       | Vite, port 5173         | Static client/dist with SPA routing                 |
| API            | Express, port 4000      | Node.js 24 function, /api/*                         |
| Database       | Local PostgreSQL        | Neon pooled URL with verified TLS                   |
| Sessions       | PostgreSQL              | Neon with Secure, HttpOnly, same-origin cookies     |
| Live updates   | Socket.IO               | Authenticated polling every 5 seconds while visible |
| SLA processing | Persistent worker       | Shared worker triggered by polling and scheduler    |
| Attachments    | Private local directory | Private Blob, direct upload, server validation      |

Local environment files, accounts, tickets and uploads are unchanged. Local commands remain `npm run dev` and `npm run server`.

## 1. Create resources

1. In **Neon → New project**, create **ResolveDesk** and its production database. Choose a region close to your Vercel function region. Keep it separate from other projects such as eDTR.
2. In Neon **Connect**, privately copy the pooled URL (hostname contains `-pooler`) and the direct URL.
3. Push these deployment changes to GitHub. In **Vercel → Create New → Project**, import ResolveDesk.
4. Set **Root Directory: repository root (`.`)**, **Framework Preset: Other**, **Node.js: 24.x**. The root `vercel.json` configures `npm ci --include=dev`, `npm run build`, and output `client/dist`. Do not choose `client` as the root: that omits the API.
5. Connect a **private** Vercel Blob store to the project, scoped to Production. Confirm the access setting; a public store is unsuitable for ticket attachments.

Creating these resources and clicking Deploy are separate steps. Until completed, ResolveDesk will not appear as a deployed project on either dashboard.

## 2. Set production environment variables

Use `server/.env.production.example` as the checklist. In **Vercel → Project Settings → Environment Variables → Production**, set:

| Variable              | Value                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| NODE_ENV              | production                                                                           |
| DATABASE_URL          | Neon **pooled** PostgreSQL URL                                                       |
| DB_SSL                | true                                                                                 |
| DB_POOL_MAX           | 3                                                                                    |
| SESSION_SECRET        | Unique random secret, at least 32 characters                                         |
| CLIENT_ORIGIN         | Exact final origin, e.g. https://resolvedesk-your-team.vercel.app, no trailing slash |
| COOKIE_SAME_SITE      | lax                                                                                  |
| CRON_SECRET           | A different random secret, at least 32 characters                                    |
| BLOB_READ_WRITE_TOKEN | Token for the connected **private** Blob store                                       |
| VITE_API_URL          | /api (also the default)                                                              |

The Vercel entrypoint forces `SERVERLESS=true`, `STORAGE_DRIVER=blob`, and `TRUST_PROXY=1`. It does not start a listener, process timer, migration, or seed. Operator commands use `DIRECT_DATABASE_URL`; that variable need not be stored in Vercel.

Generate each secret separately:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Only `VITE_API_URL` is public. Never prefix a database password, session secret, cron secret, or Blob store token with `VITE_`. Never commit real environment files. Git/Vercel ignore rules exclude local credentials and uploads.

Use the final domain as `CLIENT_ORIGIN`; changing domains requires updating it and redeploying. For previews, use an isolated Neon branch, separate private Blob store/secrets, and the preview's exact origin. Never give untrusted preview code production credentials or accept arbitrary origins.

## 3. Apply migrations explicitly

On your workstation:

```powershell
npm ci
npm run build
Copy-Item server/.env.production.example server/.env.production
```

Edit the ignored `server/.env.production` with actual production values and the **direct** Neon URL. Keep `server/.env` for local PostgreSQL unchanged. Confirm the target host/database, then run:

```powershell
node --env-file=server/.env.production server/dist/db/migrate.js
```

This applies tracked migrations, including **0007** for shared runtime counters. It does not reset databases or insert demo users. Migrations never run in a deployment build or function startup. Run them once per release before routing traffic to dependent code; serialize migration commands.

Application traffic uses the pooled URL. Operator commands prefer the direct URL. Both retain certificate verification.

## 4. Create the first production administrator

For a **fresh, empty users table**, add these operator-only values to the ignored production environment file:

```dotenv
CONFIRM_PRODUCTION_BOOTSTRAP=yes
BOOTSTRAP_ADMIN_NAME=Jayr
BOOTSTRAP_ADMIN_EMAIL=your-real-email@example.com
BOOTSTRAP_ADMIN_USERNAME=jear
BOOTSTRAP_ADMIN_PASSWORD=YOUR_UNIQUE_STRONG_PASSWORD
```

```powershell
node --env-file=server/.env.production server/dist/db/bootstrap.js
```

The transaction creates an administrator and reference departments/categories. Migration defaults supply SLA policies. It refuses to modify a database containing users. It creates no demo tickets or default passwords. Remove the bootstrap variables afterward; never add them to Vercel.

Create additional users in the administrator interface. To set an existing user's password, verify the recipient and arrange secure delivery, then temporarily add:

```dotenv
CONFIRM_PRODUCTION_PASSWORD=yes
PROVISION_EMAIL=the-existing-user@example.com
PROVISION_PASSWORD=ANOTHER_UNIQUE_STRONG_PASSWORD
```

```powershell
node --env-file=server/.env.production server/dist/db/provision.js
```

This explicit operator command changes that account's password hash, activates it, and revokes its sessions. It preserves ID, email, role, department, and ticket relationships. Remove provisioning variables afterward. This is not a self-service password-reset feature.

To retain existing local data, plan a separate PostgreSQL backup/restore and private attachment transfer. Do not bootstrap imported accounts. Restoring attachment rows alone does not transfer their file contents. The README's local demo credentials are not automatically deployed and should not secure a real production administrator.

## 5. Configure unattended SLA processing

The default configuration supports **Vercel Hobby** and calls `/api/operations/run` once daily. Visible signed-in browsers also trigger the shared worker at most once every 30 seconds. Polls authenticate against the database; notifications remain durable.

**Daily scheduling is insufficient for timely SLA alerts while nobody has the app open.** For Hobby, configure an external HTTPS scheduler to call this once per minute:

```text
GET https://YOUR-PROJECT.vercel.app/api/operations/run
Authorization: Bearer YOUR_CRON_SECRET
```

Store the secret in protected scheduler headers, never the URL or a public workflow. Enable failure retries and monitor delivery history. The endpoint rejects unauthenticated requests. PostgreSQL throttles concurrent calls; event processing uses row locks and unique keys.

Alternatively, on **Vercel Pro**, change the cron expression from `0 0 * * *` to `* * * * *`. Vercel supplies the bearer header from `CRON_SECRET`. Cron runs on production deployments. No upgrade or external scheduler is created automatically.

See [Vercel cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing). Cloud polling avoids losing instance-local socket broadcasts when functions scale. It pauses in hidden tabs and refreshes session state; local Socket.IO remains available.

## 6. Deploy

After cloud variables, migrations, and the initial account are ready, deploy the imported project in Vercel. Alternatively, from the **repository root**:

```powershell
npx vercel login
npx vercel link
npx vercel --prod
```

Choose the existing ResolveDesk project if already imported to avoid duplicates. Frontend and API deploy together. If the final hostname was assigned during the first deployment, update `CLIENT_ORIGIN` and redeploy before sign-in.

## Attachment behavior and maintenance

- Existing limits remain: up to five files, 10 MiB each, with supported PNG/JPG/WEBP/PDF/TXT validation.
- Upload preparation requires session, CSRF, ticket permission, and a shared user quota. Browser write tokens are short-lived and restricted to an exact staging path, size and MIME type. The store read/write token stays server-side.
- The browser uploads directly to private staging storage. Finalization checks a signed receipt bound to user, ticket, submission ID, metadata and expiry, reads the actual file, and validates its bytes before using the existing transactional attachment service.
- Downloads use authenticated chunks of at most 2 MiB, rechecking current permissions for each chunk. No public attachment URL is exposed.
- Staging objects remain temporarily for retry safety. Run maintenance regularly to remove staging objects, unreferenced final objects and tombstoned files older than 24 hours. Active referenced files and database rows are preserved.

Call maintenance with the same protected bearer header as the scheduler:

```text
GET /api/operations/storage
```

Each response includes `data.cursor`. If non-null, call `/api/operations/storage?cursor=URL_ENCODED_CURSOR` until null, sequentially. Schedule this complete cursor loop daily or run it as an operator task. The SLA cron does not scan Blob storage. Investigate missing active files; do not delete database records to conceal them.

Vercel has a [4.5 MB function payload limit](https://vercel.com/docs/functions/limitations). Direct uploads and chunked downloads preserve larger attachments. CSV exports over 4 MiB return an error requesting a narrower date range or filters instead of truncating rows.

## Live verification after deployment

These checks require actual cloud resources; a local build cannot validate cloud credentials:

1. Open `/api/health` and confirm database health succeeds.
2. Sign in as the production administrator; refresh a nested page to check SPA routing.
3. Create/provision an employee and agent, assign departments, and confirm their dashboards and ticket permissions.
4. In separate sessions, create, assign, reply to and resolve tickets. Updates should arrive on the next visible polling cycle. Revoked sessions must be rejected.
5. Upload/download a supported file larger than 4.5 MB, up to 10 MiB. Check unrelated employees cannot access it or internal files, and deleted attachments become inaccessible.
6. Confirm authorized scheduler calls succeed and missing/invalid secrets fail. Close browsers and verify the external minute scheduler produces SLA notifications.
7. Review Vercel logs and Neon usage, and complete a private Blob cleanup cursor loop.

## Troubleshooting

| Symptom                            | Check                                                             |
| ---------------------------------- | ----------------------------------------------------------------- |
| ResolveDesk absent from dashboards | Create/import resources; local code changes do not provision them |
| API returns HTML or 404            | Root must be `.`, using root vercel.json                          |
| CSRF/origin errors                 | Exact CLIENT_ORIGIN, HTTPS, final domain, same-origin /api        |
| Database unavailable               | Neon URL, encoded password, TLS, database availability            |
| runtime_counters missing           | Apply migration 0007 explicitly                                   |
| Uploads fail                       | Private Blob token/environment scope, quota, file content         |
| SLA alerts only when app opens     | Configure external minute scheduler or Pro cron                   |
| Imported attachments missing       | Transfer files as well as PostgreSQL rows                         |

References: [Neon connection pooling](https://neon.com/docs/connect/connection-pooling), [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk).
