# Changelog

## Unreleased

### Before you deploy

- **Take a backup first: the new migration `20261127000000_drop_workspace_activity` permanently deletes activity rows.** It removes the workspace-level events (workspace created or renamed, members added, deactivated, reactivated or removed, ownership transferred), which nothing can read since workspace Activity was removed, and the events of projects that no longer exist. Project activity is untouched. The production container applies it on start (`prisma migrate deploy`); locally run `npm run db:migrate`. To see what it will remove: `SELECT count(*) FROM "ActivityEvent" WHERE "projectId" IS NULL` plus `… WHERE NOT EXISTS (SELECT 1 FROM "Project" p WHERE p.id = "projectId")`.
- **Run the new migrations** (`20261121130005_notifications`, `20261126160000_chat_channels`) before starting the updated API. They add the `Notification` and `Channel` tables and give every existing project a `#general` channel; nothing else changes. The production container applies them on start (`prisma migrate deploy`); locally run `npm run db:migrate`.
- **Chat needs WebSockets to the API.** Sockets use `/socket.io` on the API's own host and port, so a proxy or host in front of the API must pass WebSocket upgrades through. Chat presence and delivery are kept in the API process's memory: run a single API instance (several would need a socket.io adapter and sticky sessions).

### Added

- Project chat:
  - **Chat** is a project link in the sidebar, after My work, with the project's unread count; it is also in ⌘K and in the phone's bottom navigation. It opens the chat screen: a column with the project's channels and direct messages (everyone else on the project, with an online dot or offline ring), beside the open conversation (`/w/…/p/…/chat/<channel id or dm-<userId>>`). On phones the list and the conversation are separate screens.
  - Messages show with the sender and time, grouped when one person sends several in a row. Enter sends, Shift+Enter starts a new line (on phones the Send button sends). A message the server didn't accept shows "Not sent" with Retry. Every conversation says that chat isn't saved and clears on reload.
  - Direct messages to someone offline aren't possible: the conversation explains why in place of the message box. In an archived project, chat is off.
  - A direct message you aren't looking at shows a toast with an Open button, naming the project when it's not the one you're in; channel messages only add to unread counts. The project switcher shows unread counts for your other projects.
  - Project Admins and the workspace owner add channels with + next to Channels and rename or delete them from the ⋯ menu in the channel header. Channel changes show up for everyone at once and appear in the project's Activity.
  - Each project has channels, starting with `#general`, created with the project (existing projects get one from the migration). Project Admins and the workspace owner create, rename and delete channels; deleting has the usual six-second Undo, and `#general` can't be deleted (H01–H04).
  - Messages are live only: they go to the people who can open the project and are signed in at that moment, and are never stored (H05, H08). Direct messages go between two people on the same project, and only while the other person is online (H06). Who is online is shared within the project (H07).
  - Losing access takes effect at once: removal from the project or workspace, deactivation, archiving, ownership changes, signing out and password changes all update or close the person's live connection.
  - API: `GET` and `POST /projects/:projectId/channels`, `PATCH` and `DELETE /channels/:channelId`. Socket.io at `/socket.io`, connected with `{ auth: { token, workspaceId } }`: `message:send` (`{ target: { channelId } | { projectId, userId }, body, clientId? }`), `presence:list` and `session:refresh` (send each new access token after a refresh), acknowledged as `{ ok, data | error }`; the server sends `message:new`, `presence:changed`, `channels:changed` and `access:changed`. Sending is limited to 20 messages per 10 seconds per connection.

- "Try the demo" on the sign-in page: fills in the shared demo account (`besttask@gmail.com`) and signs in. The account must exist in the target database; it is an ordinary account shared by every visitor, so anyone using it can change or delete it.
- CI runs the API integration tests on every pull request and push to `main`, against a throwaway PostgreSQL 16 database with the committed migrations applied, using the compiled API as in production.
- In-app notifications:
  - You're notified when someone assigns you a task, comments on a task you created, are assigned to or have commented on, or moves a task you created or are assigned to into another status. Never for your own actions.
  - A bell next to search in the sidebar shows the unread count (refreshed every minute and when you come back to the tab) and opens the latest notifications. Open all notifications, or the bell in the phone header, goes to a full Notifications page (also in ⌘K).
  - All / Unread, mark one read or unread, Mark all read, and Load more. Clicking a notification marks it read and opens the task.
  - A banner shows how many of your tasks in the selected project are overdue or due today (in your profile's timezone), linking to that project's My work. These are counted on request, not stored, so they never pile up.
  - Notifications are checked against your access every time they're read: if you're removed from a project, its notifications disappear, and they return if you're added back. Deleting your account deletes your notifications.
  - API: `GET /workspaces/:workspaceId/notifications` (`unread=true` to filter), `GET /workspaces/:workspaceId/notifications/summary` (`{ unread, overdue, dueToday }`; `projectId` limits the due counts to one project, unread stays workspace-wide), `POST /workspaces/:workspaceId/notifications/read-all`, `PATCH /notifications/:notificationId` with `{ read }`.
- My work: a project page (in the sidebar's project links, ⌘K and the phone menu) listing the tasks assigned to you in that project.
  - Grouped into Overdue, Today, Next 7 days, Later and No due date, soonest and most urgent first. Each row shows its status, priority and due date.
  - Tick the circle to mark a task done (or untick to reopen it to To do); click a row to open the task panel. In an archived project the list is read-only.
  - Filter by title and ID, and "Show completed" adds a Completed group. Filters are kept in the URL.
  - Subtasks assigned to you are included and name their parent.
  - Built from the project's task list, so board and panel edits show at once; there are no API changes.
- Calendar view: a third project tab next to Board and List that shows tasks by due date, month by month (weeks start on Monday).
  - Drag a task to another day to reschedule it, or onto "No due date" to clear its date. The "No due date" panel lists open tasks without a date; drag one onto a day to schedule it.
  - The + on a day adds a task due that day, with the project's default status and priority.
  - A day shows three tasks, then "+N more". Overdue tasks are red, and done and cancelled ones are muted with an icon.
  - Search and filters work as on the board, and the month is kept in the URL (`?month=YYYY-MM`).
  - On phones the calendar is a list of the month's days with tasks; dates change in the task panel.
  - Like the board, the calendar shows top-level tasks only. It uses the existing task APIs; there are no API changes.

### Changed

- Projects are chosen with a project switcher in the sidebar, below the workspace switcher, in place of the project list. It keeps you on the same page when you switch, shows archived projects disabled and has "+ New project" for the owner.
  - Archived projects are restored from a new Archived projects section in workspace settings (owner only).
  - Under it, the selected project's links: Tasks (the Board, List and Calendar tabs, which stay in the project header), My work, Activity, Members and, for the owner and project admins, Settings. Activity, Members and Settings are no longer header tabs, and the header's settings button is gone.
  - The selection stays when you open a workspace page (Members, Settings, Notifications, Profile), and is remembered per workspace across reloads. If that project is archived, gone or no longer yours, the first active project is selected.
  - The Workspace section keeps Members and Settings for the owner, and is hidden for everyone else.
- Search (⌘K) covers only the selected project: its tasks by title, description and ID, and its pages. Use the project switcher to reach other projects.

- Renamed from TaskFlow to BestTask: the app name, sign-in page, logo mark (BT), favicon, error messages and docs. Internal names follow (`besttask-api` / `besttask-web` packages, the `besttask` Docker Compose project and images, the CI test database, and the `BESTTASK_TEST_API` / `BESTTASK_TEST_RESTART` variables, which were `TASKFLOW_…`). Browser storage keys changed from `tf_…` to `bt_…`; the app moves existing values over on first load, so nobody is signed out or loses settings.
- Board redesign:
  - Each column is a rounded lane, with the status dot, name and count in its header, a column menu, and Add task inside the lane.
  - Cards are white on the lane with a soft shadow. They show the ID and a quick-action menu on top (move, assign to me, unassign, delete), a title cut at two lines, labels, and a footer with priority, due date ("Overdue", "Today" or "Tomorrow"), a subtask progress ring, comments and the assignee.
  - Done and Cancelled cards show an icon instead of strikethrough.
  - While dragging, the lane under the card takes a tint of its status.
  - The collapsed Cancelled column uses the same lane style.
- Activity status pills now adapt to dark mode.
- The list view shows 25 tasks per page (was 10).
- Manual card order: drag a card up or down within a column, or to a spot in another column, and the order is saved for everyone on the project. New tasks join at the end of their column, and changing a task's status any other way (task panel, card menu, phone) also puts it at the end. "Manual" is the new default sort for the board and list; Priority, Newest, Due date and Title remain in the Sort menu, and while one of those is chosen, dragging only changes the column.
- API: `POST /tasks/:taskId/move` with `{ status, beforeId }`. Reordering within a column is not recorded as activity; moving to another column is, as a status change.

### Removed

- The workspace Activity page (and its owner-only project and event-type filters). Each project's Activity page, the task panel history and the phone Activity tab remain.
  - Workspace-level events are no longer recorded, and existing ones are deleted by the migration above. Every activity event now belongs to a project.
  - When a deleted project is purged after its Undo window, its activity is deleted with it.
- API: `GET /workspaces/:workspaceId/activity` is replaced by `GET /projects/:projectId/activity` (paginated, `entityId` for one task's events), readable by every role that can open the project. `GET /workspaces/:workspaceId/tasks` (the cross-project task list behind workspace search and My work) is removed; use `GET /projects/:projectId/tasks`.

### Fixed

- Signing out and then into a different account no longer opens the previous account's page and shows "Workspace not available". Signing out now always returns to your default workspace after the next sign-in; after an expired session (or a sign-out in another tab) you still come back to the page you were on, but only if the same account signs in again.
- Profile photos now show wherever a person appears (board cards, list rows, comments, activity), filled in from member lists the app already loads.

## 2026-11-18 — New web app and backend upgrade

The web app was rebuilt with Vite, React 19 and TanStack Router to match the
new design, and the API gained the matching features, permission model and
performance work. Who can do what is specified in
[the feature matrix](FEATURE_MATRIX.md).

### Before you deploy

- **The Next.js app is gone.** `web/` is now a Vite single-page app.
  - On Vercel, keep **Root Directory** set to `web`; `web/vercel.json` sets the
    Vite build and serves the app for every route.
  - Set `VITE_API_URL` to the API's URL ending in `/api`. It is read at build
    time, so redeploy after changing it. `NEXT_PUBLIC_API_URL` and `API_URL`
    are no longer read and can be deleted.
  - On the API host, add the web app's origin to `CORS_ORIGIN`.
  - Local settings for the web app are documented in `web/.env.example`.
- **Deploy the API first**, then the web app, which depends on the API changes
  below.
- **API changes:**
  - `PATCH /auth/me` requires `currentPassword` when `email` changes.
  - A wrong confirmation password (email change, password change, account
    deletion) returns `400` instead of `401`.
- The integration test is now `npm run test:integration`
  (`tests/integration.mjs`); it was `npm run test:redesign`.

### Added

- Roles: one workspace owner (with ownership transfer); Admin and Member roles
  per project; access to a project only through assignment.
- Per-project seat limits, project archive and restore, and owner-only project
  creation and deletion.
- Tasks: subtasks, an In review status, labels, comments, due dates,
  duplication and search; personal saved views in the list.
- Activity that records what changed (before and after values), paged with
  Load more, with owner-only filters.
- Six-second Undo for deleting tasks, labels and projects and for removing
  members, kept in the database so it survives an API restart.
- Web app:
  - Board with drag and drop, list with paging and saved views, a task panel,
    and activity feeds.
  - Project members and settings, workspace members and settings, profile and
    account settings, and ⌘K search.
  - Dark mode and a phone layout below 768px.
  - Clear error screens with Try again; the app notices when you lose access to
    a project or workspace.
  - Accessibility: no axe (WCAG 2.1 A/AA) violations on the main screens in
    either theme, focus that returns to where you were, and a Skip to content
    link.

### Changed

- API reads take about 110 ms and writes about 370 ms against the hosted
  database, down from about 1,000 ms and 1,600 ms.
- Where the app differs from the design prototype:
  - Not built, per the feature matrix: notification settings (C04–C07),
    project visibility (P13), and a default assignee (S08).
  - Toasts are light in light mode (the prototype's are always dark). Dark mode
    and its colors are our own extension of the prototype palette.
  - Browser-native form controls are replaced with styled ones (selects,
    checkbox, date picker, number steppers, tooltips, color picker), and text
    areas grow with their content.
  - Project settings has no breadcrumb, and the workspace-level pages share one
    header and width.
  - On phones, only the board uses the mobile layout; other pages show the
    desktop page full width with a Back to board bar.

### Known limitations

- Tested mainly in Chrome. The main browser suite also passed in Firefox and
  WebKit, but keyboard and drag-and-drop checks there were not finished, and
  real Safari, iOS and Android devices were not tested.
- Screen-reader support was checked with automated tools only, not with NVDA
  or VoiceOver.
- The Undo button lives in the open page: reloading or closing the tab during
  the six seconds gives up the chance to undo, and the deletion completes.
- Activity type filters run in the browser, so a rare filter may need several
  page loads; the feed fetches up to 10 pages automatically, then offers to
  search further.
