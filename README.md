# TaskFlow

Full-stack project and task management: workspaces, Kanban boards, labels,
comments, and an activity feed. The **Express REST API** holds the domain logic;
the **web app** is a React single-page app (Vite, TanStack Router and TanStack
Query) that calls the REST API from the browser with Bearer tokens kept in
`localStorage`. The backend is structured so the same
services can later be exposed through an MCP server without duplicating
authorization or business rules.

## Stack

| Layer    | Technologies |
| -------- | ------------ |
| API      | Express 5, TypeScript, Zod, Prisma 7, Prisma Postgres |
| Web      | Vite, React 19, TanStack Router + Query, Tailwind CSS 4, Base UI, dnd-kit |
| Auth     | JWT access tokens + rotating opaque refresh tokens (argon2 password hashing) |
| Dev ops  | Docker Compose (API + web), hosted Prisma Postgres |

## Features

- **Workspaces** with slug, settings, and workspace ownership and project roles (`WORKSPACE_OWNER`, `ADMIN`, `MEMBER`)
- **Projects** with status, archive/unarchive, and per-project **board**, **list** and **calendar** views
- **Tasks** with status, priority, assignee, due dates, subtasks, and drag-and-drop on boards
- **Labels** at project scope, attachable to tasks
- **Comments** (soft-deleted for activity continuity)
- **Activity** feed per workspace
- **My work**: your assigned tasks across every project, grouped by due date
- **Members** management with explicit project roles (no invitations)

## Running it

**Prerequisites:** Docker, a Prisma Postgres database, and a copy of `.env`
(see `.env.example`). In Prisma Console, generate both connection strings for
the same database. Put the pooled string in `DATABASE_URL` and the direct string
in `DIRECT_URL`. If you already have a `.env`, replace its local database URLs
and remove the old `*_CONTAINER` and local `SHADOW_DATABASE_URL` entries. Keep
the credentials in the ignored `.env` file.

The API and web run in Docker and connect to the hosted database.

```bash
cp .env.example .env             # first time; set both database URLs and JWT secrets
docker compose up -d --build     # API on http://localhost:4000, web on http://localhost:3100
docker compose exec api npm run db:migrate  # apply the checked-in migrations
curl localhost:4000/health       # {"status":"ok","database":"up"}
```

The API Dockerfile generates the Prisma client and compiles the API while
building the image. Its default command applies committed migrations before
starting the compiled API. Compose overrides that command with the dev server,
so run the migration command shown above for local development. Compose also
regenerates the client at startup because its development bind mount hides
generated files from the image.

Open the UI at `http://localhost:${WEB_PORT:-3100}` and register an account.

Existing data in a local database is not copied by the migration command.

**First time**, or after changing dependencies:

```bash
docker compose run --rm api npm ci
docker compose run --rm web npm ci
docker compose exec api npm run db:migrate
```

### Web on the host

In development the browser calls `/api` on the Vite dev server, which forwards
it to the API (`API_PROXY_TARGET`, default `http://localhost:4000`; Compose sets
`http://api:4000`). No CORS setup is needed.

If you run the UI locally instead of Compose:

```bash
cd web && npm ci && npm run dev   # http://localhost:3100
```

Auth: login/register store access and refresh tokens in `localStorage`
(`web/src/lib/auth.ts`). Requests use `Authorization: Bearer` via
`web/src/lib/api.ts`, with automatic refresh on `401`. Route protection is
client-side, in the `_app` route's `beforeLoad`.

### Day-to-day commands

`node_modules` for API and web live in Docker volumes when using Compose:

```bash
docker compose exec api npm run typecheck
docker compose exec web npm run typecheck
docker compose exec api npm run db:migrate
docker compose logs -f api
docker compose logs -f web
```

### Database connections and migrations

`DATABASE_URL` is Prisma Postgres's pooled connection for API queries.
`DIRECT_URL` connects directly for Prisma CLI commands such as migrations.
Both values come from the same database in Prisma Console and require TLS.
`npm run db:migrate` applies the migration files in `prisma/migrations`; review
them before running against a database with data. To create a new migration with
`npm run db:migrate:dev -- --name <name>`, configure `SHADOW_DATABASE_URL` for a
**separate disposable database** first; never point it at the main database.

### GitHub CI and Vercel deployment

GitHub Actions runs API and web checks on pull requests and pushes to `main`.
The API Docker image build does not connect to the database. When a production
container starts, it runs `prisma migrate deploy` before accepting requests.
This applies only committed migrations. Set `DIRECT_URL` on the API host to the **direct connection URL for the
production database**. The API container also needs `DATABASE_URL` for its
pooled application queries.

Deploy the Express API on a separate host. Set `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` there. Import this repository into Vercel with **Root Directory** set to `web`;
`web/vercel.json` sets the Vite build and serves `index.html` for every app
route. Set `VITE_API_URL` in Vercel to the deployed API's HTTPS URL ending in
`/api` (for example, `https://api.example.com/api`). Vite reads it at build
time, so redeploy after changing it. On the API host, add the web app's origin
(for example, `https://taskflow.vercel.app`) to `CORS_ORIGIN`; it takes a
comma-separated list of exact origins, so preview deployments need their URL
added too. The web app does not need database credentials.

Vercel deploys from GitHub automatically. Start the updated API container and
verify its migration succeeds before promoting web changes that depend on the
new schema.

## Repository layout

```
src/                    # Express API
  server.ts app.ts routes.ts env.ts
  lib/                  prisma, tokens, password, errors, http, pagination, rbac, …
  middleware/           requireAuth, errorHandler
  modules/<auth|workspaces|projects|tasks|labels|comments|activity>/
                        *.routes.ts  *.controller.ts  *.service.ts  *.schema.ts

web/                    # Vite + React app
  src/routes/           file-based TanStack Router routes (/login, /w/$workspaceId/…)
  src/components/       ui primitives, app shell, tasks (board, list, calendar, panel), mobile
  src/lib/              api client, auth, query keys + options, mutations, design tokens

prisma/                 schema and migrations
tests/                  API integration test (npm run test:integration)
```

Every API module repeats the same four files: routes map paths to controllers,
controllers validate input and call services, and services hold business logic.

### The one rule that matters

Services never touch `req` or `res`. They take an explicit `actor` and plain
arguments, and they perform their own authorization through
`requireMembership`. That is what makes an MCP phase straightforward: a tool
handler builds an actor and calls the same function the HTTP layer calls, with
identical permission checks and no HTTP round trip.

```
Express routes/controllers ─┐
                            ├─> services ──> Prisma ──> Postgres
MCP tools (later)          ─┘
```

## API reference

Base path: `/api`. Send `Authorization: Bearer <accessToken>` on all routes
except register, login, and refresh.

### Auth

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /auth/me`

### Workspaces and members

- `POST /workspaces`, `GET /workspaces`
- `GET /workspaces/:workspaceId`, `PATCH /workspaces/:workspaceId`, `DELETE /workspaces/:workspaceId`
- `GET /workspaces/:workspaceId/members`, `POST /workspaces/:workspaceId/members`
- `PATCH /workspaces/:workspaceId/members/:userId`, `DELETE /workspaces/:workspaceId/members/:userId`

### Projects

- `POST /workspaces/:workspaceId/projects`, `GET /workspaces/:workspaceId/projects`
- `GET /projects/:projectId`, `PATCH /projects/:projectId`, `DELETE /projects/:projectId`
- `POST /projects/:projectId/archive`, `POST /projects/:projectId/unarchive`

### Tasks

- `POST /projects/:projectId/tasks`, `GET /projects/:projectId/tasks`
- `GET /workspaces/:workspaceId/tasks`
- `GET /tasks/:taskId`, `PATCH /tasks/:taskId`, `DELETE /tasks/:taskId`
- `PATCH /tasks/:taskId/status`, `PATCH /tasks/:taskId/assignee`
- `POST /tasks/:taskId/move` (drag and drop: `{ status, beforeId }` places the task before that card, or last when `beforeId` is null)
- `GET /tasks/:taskId/subtasks`
- `POST /tasks/:taskId/labels`, `DELETE /tasks/:taskId/labels/:labelId`

### Labels, comments, activity

- `GET /projects/:projectId/labels`, `POST /projects/:projectId/labels`
- `PATCH /labels/:labelId`, `DELETE /labels/:labelId`
- `GET /tasks/:taskId/comments`, `POST /tasks/:taskId/comments`
- `PATCH /comments/:commentId`, `DELETE /comments/:commentId`
- `GET /workspaces/:workspaceId/activity`

### Roles

TaskFlow uses `WORKSPACE_OWNER`, `ADMIN`, and `MEMBER`. Each workspace has
exactly one owner; Admin/Member roles belong to explicit project assignments.
Any registered user may create a workspace and become its owner. Only the
workspace owner manages workspace people/settings, creates projects, changes
seat limits, and archives/restores/deletes projects. Assigned project admins
manage project settings and other project users; they cannot remove or demote
themselves. Members can create/edit/delete tasks and their own comments.
No actor can edit/delete another user's comments. Archived projects reject
writes. Unassigned users receive `404` for inaccessible projects/tasks.

See [the feature matrix](FEATURE_MATRIX.md) for all agreed rules and
[the changelog](CHANGELOG.md) for what changed and known limitations. The web
app follows the design prototype (removed after implementation; see git
history); its values live as design tokens in `web/src/styles.css` and
`web/src/lib/design.ts`.

### Integration tests

`npm run test:integration` exercises the running API at `http://localhost:4000/api`
(override with `TASKFLOW_TEST_API`). It creates unique test accounts/workspaces
and cleans up only its own fixtures. It does not reset the database. Tests cover
project isolation, role enforcement, seats, ownership transfer, comments, saved
views, preference persistence, sessions, and the six-second Undo window.

The initial migration defines the current schema. The existing hosted
Prisma Postgres database was reset with user authorization during development;
no old-data migration/backfill is included. Do not run a reset as a normal startup
step. Future schema changes still need reviewed migrations.

### Conventions

Lists return `{ data, meta: { page, pageSize, total, totalPages } }` and accept
`page` and `pageSize` (max 100). Errors return
`{ error: { code, message, details? } }`: `400` bad request, `401`
unauthorized, `403` forbidden, `404` not found, `409` conflict, `422`
validation failure.

Task list filters: `status`, `priority` (repeatable), `assigneeId` (a uuid, or
`me`/`unassigned`), `projectId`, `labelId`, `parentTaskId`, `topLevelOnly`,
`dueBefore`, `dueAfter`, `search`, and `sort` (prefix with `-` to reverse).

## Implementation notes

- Refresh tokens are opaque random strings stored as HMACs and rotated on every
  refresh; replaying a used one fails.
- `completedAt` is derived from status rather than accepted from clients, and a
  task cannot be marked `DONE` while it has unfinished subtasks.
- Comments are soft-deleted so the activity trail keeps pointing at something.
- npm 11 blocks install scripts by default; `argon2`, `esbuild` and the Prisma
  engines are approved in `package.json` under `allowScripts`.
