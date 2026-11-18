# Changelog

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
