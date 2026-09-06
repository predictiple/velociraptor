# Velociraptor GUI — Behavioral Test Matrix

Executable specification of current GUI behavior, guarding against
regressions. Each cell is either a test
(✅ = written & passing, 🔲 = planned) or a conscious "not worth testing"
decision (—). The goal: every user-facing behavior is either verified or
explicitly deprioritized.

Run: `npx playwright test` (from `gui/velociraptor`)

Legend:
- ✅ written & passing
- 🔲 planned / to write
- — consciously skipped (low value or covered elsewhere)

---

## 1. View Artifacts (`/artifacts`) — DONE

Spec: `src/components/artifacts/artifacts.spec.js` (7 tests)
States: `src/components/artifacts/artifacts-states.spec.js` (7 tests)
E2E:  `src/components/artifacts/artifact-lifecycle.spec.js` (1 test)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| View list | ✅ | ✅ toolbar renders | ✅ spinner | ✅ API failure | — |
| Search | ✅ filters by name | ✅ no-match (implicit) | ✅ (via spinner test) | ✅ (via API failure) | ✅ special chars |
| Clear search | ✅ | — | — | — | — |
| Select & inspect | ✅ description pane | ✅ empty-state msg | — | — | — |
| Preset filter | ✅ default CLIENT | — | — | — | ✅ switch to Server/All |
| Edit (disabled state) | ✅ | — | — | — | — |
| Hunt enable | ✅ | — | — | — | — |
| Collect (needs client) | ✅ disabled w/o client | — | — | — | 🔲 enabled in client ctx |
| Upload artifact pack | ✅ dialog opens | — | — | ✅ bad file (malformed-YAML zip) | |
| Create artifact (E2E) | ✅ | — | — | ✅ name validation | ✅ unique name |
| Delete artifact (E2E) | ✅ | — | — | — | |
| Inspect report (E2E) | ✅ | — | — | — | |

**Loading / Error cells:** all `🔲` loading cells above are marked `—` because
the only meaningful loading state is the initial list fetch, already covered by
the spinner test; the selection-pane and per-action states render synchronously
from cached data with no independent spinner. All `🔲` error cells are marked
`—` because every API failure surfaces through the same shared error path
already tested in the list-failure test.

**Upload bad-file test:** the fixture `src/components/artifacts/fixtures/bad-artifact.zip`
is built with Python's `zipfile` (a hand-built STORE zip was rejected by the
server's Go zip reader) and contains `bad_artifact.yaml` with unparseable YAML;
the server surfaces "yaml: mapping values are not allowed in this context" in
`.artifact-import-errors`.

---

## 2. Hunt Manager (`/hunts`) — DONE

Spec: `src/components/hunts/hunts.spec.js` (6 tests)
Actions: `src/components/hunts/hunts-actions.spec.js` (7 tests)
E2E:  `src/components/hunts/hunt-lifecycle.spec.js` (1 test)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| View hunt list | ✅ | ✅ "Table contains no data" | — | — | — |
| Search/filter hunts | ✅ filter by tag chip | — | — | — | ✅ filter by creator/tag |
| Select hunt → inspector | ✅ (E2E) | ✅ "Please select a hunt above" | — | ✅ 404 hunt → redirect | |
| New Hunt wizard | ✅ opens on Configure Hunt | — | — | ✅ expiry in past | ✅ step gating before artifact |
| Modify Hunt | ✅ dialog prefilled | — | — | — | |
| Run Hunt (confirm dialog) | ✅ | — | — | — | |
| Stop Hunt | ✅ disabled for PAUSED | — | — | — | |
| Delete Hunt (confirm dialog) | ✅ (E2E) | — | — | — | |
| Copy Hunt | ✅ wizard prefilled | — | — | — | |
| Hunt tabs (overview/clients/notebook) | ✅ (E2E: overview shows Hunt ID / Artifact Names) | — | — | — | |
| Toolbar disabled/enabled states | ✅ | — | — | — | |

**Notes:** hunt-list.jsx has Modify/Run/Stop/Delete/Copy toolbar actions, tag
filtering, creator filter. new-hunt.jsx has include/exclude conditions, expiry
validation ("Expiry time is in the past!"). Wizard gotchas: react-step-wizard
renders ALL steps' paginators in the DOM — the active step is the one whose
wrapper is `position:relative`; links in inactive footers are covered, so
navigate by clicking the target link in the CURRENTLY active footer, then wait
for the target wrapper to become relative. The Launch step auto-submits
(componentDidUpdate on isActive) and closes the wizard — assert the modal
closes rather than waiting for the step to activate. Delete dialog title and
body both contain "Delete these hunts?" — use `{ exact: true }`.

**Actions spec (hunts-actions.spec.js):** creates a PAUSED hunt via the API
(`CreateHunt` with `hunt_description` TOP-LEVEL, not inside `start_request`),
then exercises Modify (tags/description/expiry), Run (confirm dialog), Stop
(disabled for PAUSED), Copy (wizard prefilled), tag-filter chip, "Show only my
hunts" filter, and 404 deep-link redirect. Deletes the hunt in afterAll via
`Server.Hunts.CancelAndDelete`. GUI quirks frozen: Modify dialog title is
"Modify Hunt" (scope `.modal-title`); tags select is `.modal-body .labels`;
wizard close button is the header X (`.first()`); TransformViewer renders
`Tags ( tag )` with spaces → regex `/Tags\s*\(\s*actions-test-tag\s*\)/`.

---

## 3. Server Events (`/events/server`) — DONE

Spec: `src/components/events/events.spec.js` (13 tests)
E2E:  `src/components/events/event-lifecycle.spec.js` (1 test)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| View monitoring tables | ✅ | ✅ "Please select an artifact to view above." | — | — | — |
| Select artifact from dropdown | ✅ | — | — | — | ✅ deep link to slash-named artifact fails (router) |
| Update monitoring table | ✅ (E2E) | — | — | — | ✅ Launch auto-submits when no tools |
| Show/hide server vs client tables | ✅ | — | — | — | |
| Edit/delete notebook from events | ✅ | — | — | — | ✅ notebook auto-created, cleaned via API |

**Gotchas (documented behavior quirks):**
- **Router slash bug:** deep links to slash-named artifacts (`Server.Monitor.Health/Prometheus`) fail — the `/` is parsed as the `:time` route param, so the artifact resolves to `Server.Monitor.Health` and no table renders. Must select via the `.event-artifacts` dropdown.
- **ColumnToggle menu stays open after a select** (controlled `show`: `open = metadata.source === "select" || nextOpen`); don't re-click the toggle between toggles.
- **Artifact row click TOGGLES** selection — clicking an already-monitored artifact removes it.
- Search filters results, so `row-selected` count is relative to the filtered set — scope with `hasText` on the artifact name.
- Wizard initial load is async (proto2tables → GetArtifacts); wait for search-table rows before interacting.
- Notebook mode auto-creates `N.E.<artifact>-server`; delete it in afterAll via `DeleteNotebook`.
- `max_upload_bytes` in GetServerMonitoringState is computed server-side (default 1GB, `launcher.go`), not stored config — wizard launch is safe.
- `Server.Internal.ArtifactModification` is a built-in, NOT in the SERVER_EVENT artifact store search — not usable in lifecycle tests; `Server.Monitoring.ClientCount` is.
- **CSRF on API POSTs:** the standalone Playwright `request` fixture has its own cookie jar, but the CSRF token is session-bound — POSTs through it return `403 Forbidden - CSRF token invalid`. Use `page.request` (shares page cookies) with `X-CSRF-Token` from `window.CsrfToken` AND a `Referer: https://localhost:8889/app/index.html` header (gorilla/csrf SameSite Strict rejects requests without a referer).
- **DeleteEvents cleanup:** `Server.Utils.DeleteEvents` (the `delete_events` VQL plugin → `launcher.DeleteEvents`) removes both row and log files, but only reliably once the monitoring table is back to baseline — otherwise the collector recreates the log file. Restore baseline first, poll until the collector stops, then delete and poll `ListAvailableEventResults` until the artifact disappears.

---

## 4. Server Artifacts (`/collected/server`) — DONE

Spec: `src/components/flows/server-flows.spec.js` (7 tests)
Actions: `src/components/flows/flows-actions.spec.js` (4 tests)
E2E:  `src/components/flows/collection-lifecycle.spec.js` (1 test)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| View collected flows list | ✅ | ✅ "Please click a collection in the above table" | — | — | — |
| Select flow → inspector | ✅ | — | — | — | |
| New Collection (launch artifact) | ✅ (E2E) | — | — | — | ✅ step gating before artifact |
| Delete collection (confirm) | ✅ (E2E) | — | — | — | |
| Cancel collection | ✅ disabled for FINISHED | — | — | — | |
| Copy collection | ✅ wizard prefilled | — | — | — | |
| Save to favorites | ✅ dialog opens | — | — | — | |
| Add to hunt | ✅ absent on server | — | — | — | ✅ present on client (client-flows) |
| Show only my collections | ✅ filter toggle | — | — | — | |
| Build offline collector | ✅ present on server | — | — | — | ✅ absent on client |

**Notes:** flows-list.jsx has New Collection, Add to hunt, Delete, Cancel,
Copy, Save Collection, "Show only my collections" toggle, creator filter.
The New Collection wizard is the same react-step-wizard machinery as the
hunt wizard — same navigation gotchas apply (see section 2): click the
target link in the CURRENTLY active footer, then wait for the target
wrapper to become `position:relative`. The wizard opens on the Select
Artifacts step already — do NOT try to navigate to the active step (its
paginator item is not a clickable link). The Review step renders the
request in a VeloAce; other hidden steps also render ace editors, so scope
with `.modal-body` nth(3). Delete dialog: title "Permanently delete
collections", confirm button "Yes do it!". Server-only artifact used for
the E2E: `Server.Information.Users` (read-only, fast). The lifecycle test
always deletes the collection it creates.

**Actions spec (flows-actions.spec.js):** beforeAll creates a FINISHED
`Server.Information.Users` flow via `CollectArtifact` (poll `GetFlowDetails`
until state FINISHED), afterAll deletes it via `Server.Utils.DeleteFlow`
(env keys `FlowIds` as JSON array string, `ClientId`, `Sync=Y`,
`ReallyDoIt=Y`; runs async, may lag 30-60s). Tests Copy Collection wizard,
Save Collection favorites dialog, Cancel disabled for FINISHED, and the
"Show only my collections" filter. Rows are matched by flow ID (not index)
for robustness. GUI quirks frozen: the SaveCollectionDialog reads
`flow.artifacts_with_results`, which `GetFlowDetails` does NOT include, so
the favorites dialog genuinely shows no artifact names — the test asserts
title + Name/Description fields only; the toolbar my-collections toggle's
sr-only text is **"Show only my hunts"** (copy-paste bug) — that IS its
accessible name; clear the filter via "Show all hunts". `GetClientFlows`
pagination params are `start_row` + `rows` (not `page_size`/`count`/`start`).

---

## 5. Notebooks (`/notebooks`) — DONE

Specs: `src/components/notebooks/notebooks.spec.js` (7 tests),
`src/components/notebooks/notebook-lifecycle.spec.js` (1 E2E, self-cleaning),
`src/components/notebooks/notebooks-actions.spec.js` (5 tests),
`src/components/notebooks/notebooks-error.spec.js` (1 test)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| View notebook list | ✅ | ✅ empty-state prompt | — | — | — |
| New Notebook | ✅ wizard 5 steps + template | — | — | — | |
| Copy Notebook | ✅ wizard prefilled | — | — | — | ⚠️ sr-only "New Notebook" bug |
| Delete Notebook (confirm) | ✅ lifecycle E2E | — | — | — | ⚠️ index refresh race |
| Edit Notebook | ✅ dialog prefilled | — | — | — | |
| Export Notebook | ✅ dialog opens | — | — | — | |
| Notebook Uploads | ✅ dialog opens | — | — | — | |
| Full Screen toggle | ✅ | — | — | — | |
| Cell: run VQL | ✅ lifecycle E2E | — | — | ✅ bad VQL → error message | |
| Cell: render table/chart | ✅ table output | — | — | — | |

**Gotchas (documented behavior quirks):**
- **Copy Notebook button has sr-only text "New Notebook"** (copy-paste bug in
  notebooks-list.jsx) — `getByRole("button", {name: "New Notebook"})` resolves
  to 2 buttons; always use `page.locator("nav.toolbar button", {hasText: "New Notebook"}).first()`.
- **Wizard steps 1 and 3 both titled "New Notebook: Configure Parameters"** —
  strict-mode violation; use `.first()` for title assertions.
- **Wizard gating differs from hunts/flows:** step 1 (Configure Notebook)
  enables ALL steps (no `isFocused`); only step 2 (Select Template) gates
  Configure Parameters/Review/Launch until a template artifact is chosen.
  Assert gating via `page.locator(".modal-footer").nth(1).locator(".pagination li.disabled", {hasText: name})`.
- **Cell toolbar buttons are icon-only** (no sr-only text) — select by FA6 icon
  class: `page.locator("button svg.fa-pencil").first().locator("xpath=..").click()`.
  Icons: non-editing = `fa-rectangle-xmark` (Cancel), `fa-arrows-rotate`
  (Recalculate), `fa-stop`, `fa-compress`, `fa-pencil` (Edit), `fa-arrow-up`,
  `fa-arrow-down`, `fa-rotate-left`, `fa-rotate-right`, `fa-file-import`,
  `fa-plus` (Add Cell dropdown); editing = `fa-rectangle-xmark`, `fa-text-height`,
  `fa-floppy-disk` (Save & Run), `fa-trash`.
- **New cell is inserted ABOVE the parent cell** (services/notebook/cells.go);
  cells render in `cell_metadata` order. After Add Cell → VQL in a fresh
  notebook, the new cell is the FIRST `.notebook-cell` — select it explicitly
  (`page.locator(".notebook-output").first().click()`) before editing, because
  `setSelectedCellId(response.data.latest_cell_id)` does not stick.
- **Cell messages (incl. the ERROR line) only render while the cell is
  selected** (`{ selected && ... }` in notebook-cell-renderer.jsx) — click the
  cell output to select it before asserting `.error-message`.
- **Empty notebook state:** "Select a notebook from the list above." (also
  shows for notebooks with no cells).
- **`Notebooks.Default` template** = 1 markdown cell ("Welcome to Velociraptor
  notebooks!") + 1 `vql_suggestion` (only appears under Add Cell → Suggestions,
  not a real cell).
- **Delete index-refresh race (server bug):** the notebook list index rebuild
  is gated on `index_mtime >= store_version` with second-granularity timestamps
  (services/notebook/shared.go `GetSharedNotebooks`). When a delete lands in
  the same second as the last index write, the stale index (still containing
  the deleted notebook) is served until any other notebook event bumps the
  version. The lifecycle spec therefore verifies deletion via the API
  (`GetNotebooks?notebook_id=...` → empty items) instead of asserting the row
  disappears.
- **`notebooks()` VQL plugin returns empty** for listing — use the GUI HTTP API
  (`v1/GetTable?type=NOTEBOOKS`) for inspection.
- **Bad-VQL error test (notebooks-error.spec.js):** running
  `SELECT * FROM DefinitelyNotARealPlugin()` renders
  "Plugin DefinitelyNotARealPlugin not found." as an `.error-message` in the
  cell (plus a `debug-message` Query Stats line).

---

## 6. Users (`/users`) — DONE

Specs: `src/components/users/users.spec.js` (10 tests),
`src/components/users/user-lifecycle.spec.js` (1 E2E, self-cleaning),
`src/components/users/users-actions.spec.js` (2 tests)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| View user list | ✅ | — | — | — | — |
| Select user → ACL inspector | ✅ | ✅ "Please Select a User" | ✅ "Loading ACLs" | — | |
| Add a new user | ✅ lifecycle E2E | — | — | — | |
| Update user password | ✅ dialog opens | — | — | — | |
| Assign user to Orgs | ✅ dialog opens | — | — | ✅ "Please Select an Org" | |
| Roles / permissions display | ✅ | — | — | — | |
| Users vs Orgs tab | ✅ | — | — | — | |

**Gotchas (documented behavior quirks):**
- **ACL viewer renders nothing until a user is selected** (`PermissionViewer`
  returns an empty fragment when `username` is empty); "Please Select an Org"
  renders as a bare `div.no-content` WITHOUT the `.permission-viewer` class —
  scope third-column assertions to `.users-search-panel .row > .col-sm-4`.
- **Role toggles detach during updates:** `setACL()` resets the ACL to `{}`
  ("Loading ACLs") while the `SetUserRoles` POST is in flight, removing the
  switches from the DOM. Use `click()` + `expect().toBeChecked()` (which
  re-queries) — `check()`/`uncheck()` fail on the detached element.
- **`org_admin` role and `ORG_ADMIN` permission are disabled outside the root
  org** (`isRoleDisabled`/`isPermissionDisabled` in user-inspector.jsx).
- **Effective Permissions card:** perms in `effective_permissions` render
  checked AND disabled (`Perm2_*` ids); perms NOT in the set stay enabled.
  Admin has no "Extra Permissions" card (no extra perms) — only Roles +
  Effective Permissions cards.
- **Add User dialog title is "Add a new  User"** (double space in the i18n
  key); `getByText` normalizes whitespace and also matches the sr-only
  toolbar label + tooltip — scope to `.modal-title`.
- **Modal "Close" buttons:** header X (`aria-label="Close"`) + footer button —
  scope to `.modal-footer button`.
- **Removing the last role** triggers the ConfirmDialog
  ("You are about to remove user X from Org Y") and deletes the user from the
  org via `SetUserRoles` with empty roles — this is the only UI path to remove
  a user. The lifecycle spec verifies removal via the API
  (`GetGlobalUsers` → names no longer contains the user).
- **New users get the `reader` role by default** (AddUserDialog posts
  `roles: ["reader"]`).
- **Actions spec (users-actions.spec.js):** Update User Password dialog —
  the password fields have EXACT placeholder text "Password" and
  "Retype Password" (assert with `{ exact: true }`); Assign user to Orgs
  dialog — org selector placeholder is `.org-selector .velo__placeholder`
  "Select an org", "All Orgs" button, footer Close.

---

## 7. Host Information (`/host/:client_id`) — DONE

Spec: `src/components/clients/host-info.spec.js` (8 tests)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| View client summary | ✅ | — | — | — | — |
| Client status (online/offline) | ✅ "Connected" in summary | — | — | — | |
| Overview details (ID, OS, hostname, IP) | ✅ | — | — | — | |
| Toolbar actions (Interrogate/VFS/Collected/Label) | ✅ | — | — | — | |
| Mode switch: Overview / VQL Drilldown / Shell | ✅ | — | — | — | |
| Mode active-state toggling | ✅ | — | — | — | |
| Quarantine button present | ✅ | — | — | — | |
| Sidebar Host Information link | ✅ | — | — | — | |
| Labels display | — (client has no labels; covered by LabelClients in clients-list) | — | — | — | — |
| Metadata editor | — (read-only view; write flows covered elsewhere) | — | — | — | — |

**Notes:** Deep-linking requires `?org_id=root` in the URL — the app redirects
to `#/welcome` when the org param is missing (user.jsx updateTraits). VFS /
Collected toolbar items are `<Link role="button">` so they expose as buttons,
not links. Quarantine icon is `suitcase-medical` (not `medkit`). Tests avoid
destructive actions (interrogate/quarantine/label/metadata writes) so the
client is never mutated.

---

## 8. Virtual Filesystem (`/vfs/:client_id`) — DONE

Spec: `src/components/vfs/vfs.spec.js` (4 tests)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| Browse directory tree | ✅ | ✅ | — | — | |
| Navigate into folder | ✅ | — | — | — | |
| File list rendering | ✅ | — | — | — | |
| File stats | ✅ | — | — | — | |
| VFS path in URL | ✅ | — | — | — | |

**Notes:** Uses the live client `C.9e12b994f5c41ab6` (1oca1host). The
refresh step launches a read-only `System.VFS.ListDirectory` collection on
the client; everything else is read-only. The root pane shows either
"No data available" (never collected) or "Directory is empty." (collected
with no rows) depending on server state.

---

## 9. Collected Artifacts — client (`/collected/:client_id`) — DONE

Spec: `src/components/flows/client-flows.spec.js` (2 tests)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| View collected flows list | ✅ | ✅ (shared empty state) | — | — | — |
| Select flow → inspector | ✅ | — | — | — | |
| New Collection (launch artifact) | 🔲 (shared wizard, covered on server) | — | — | — | |
| Delete collection (confirm) | 🔲 (shared dialog, covered on server) | — | — | — | |
| Cancel collection | 🔲 (shared dialog, covered on server) | — | — | — | |
| Copy collection | 🔲 (shared wizard, covered on server) | — | — | — | |
| Save to favorites | 🔲 (shared dialog, covered on server) | — | — | — | |
| Add to hunt | ✅ present | — | — | — | ✅ absent on server |
| Show only my collections | 🔲 (shared toggle, covered on server) | — | — | — | |
| Build offline collector | ✅ absent | — | — | — | ✅ present on server |

**Notes:** Uses the live client `C.9e12b994f5c41ab6` (1oca1host). The
wizard/dialog machinery is shared with the server view, so the client spec
covers the client-context differences (Add to hunt present, offline
collector absent) plus row→inspector. The toolbar sr-only quirk: the
my-collections toggle reads "Show only my hunts" even in the flows view.

---

## 10. Client Events (`/events/:client_id`) — DONE

Spec: `src/components/events/client-events.spec.js` (4 tests)

Same journey set as Server Events but per-client: artifact selector lists
the client event artifacts (Generic.Client.Stats, Server.Internal.ClientInfo,
System.Flow.Completion), toolbar exposes the client monitoring actions
(Update client monitoring table / Show client monitoring tables), and the
event table renders for a selected artifact. Uses the live client
`C.9e12b994f5c41ab6` (1oca1host). Non-destructive.

---

## 11. Home / Dashboard (`/dashboard`) — DONE

Spec: `src/components/sidebar/dashboard.spec.js` (3 tests)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| Dashboard renders | ✅ | — | — | — | |
| Time-range selector (Last Hour → Last Week) | ✅ | — | — | — | |
| Redraw dashboard | ✅ | — | — | — | |
| Edit dashboard | ✅ | — | — | — | |

**Notes:** user-dashboard.jsx has time ranges (Last Hour, Last 6 Hours, Last
Day, Last 2 days, Last Week), Redraw and Edit toolbar.

---

## 12. Secrets (`/secrets`) — DONE

Spec: `src/components/secrets/secrets.spec.js` (3 tests)
Actions: `src/components/secrets/secrets-actions.spec.js` (1 test)
E2E:  `src/components/secrets/secret-lifecycle.spec.js` (1 test)

| Journey | Happy | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| View secret list | ✅ | ✅ | — | — | — |
| Add secret (from template) | ✅ (E2E) | — | — | — | |
| Edit secret properties | ✅ (E2E) + actions | — | — | — | |
| Delete secret (confirm) | ✅ (E2E) | — | — | — | |
| Verify expression | ✅ | — | — | — N/A: display-only text, no verify button | |
| Share with users / visible to all orgs | ✅ actions | — | — | — | |

**Notes:** secrets.jsx has Edit/Delete/Add-from-template modals, Verify
Expression, share-with-users, visible-to-all-orgs.

**Actions spec (secrets-actions.spec.js):** beforeAll `POST /api/v1/AddSecret`
(SMTP Creds, `{server, server_port}`), afterAll `POST /api/v1/ModifySecret
{delete:true}`. Tests the Edit Secret dialog: title "Edit Secret properties",
"Share secret with these users" `.users` select, "Visible To All Orgs"
toggle. **GUI bug frozen:** `EditSecretDialog` never copies the secret prop
into `state.secret`, so the heading renders "Edit Secret " with an EMPTY
name — the test asserts the title + share fields only.

---

## Cross-cutting behaviors (worth a dedicated spec)

| Behavior | Status |
|---|---|
| Sidebar navigation: all links present & clickable | ✅ (`sidebar/navigation.spec.js`, 4 tests) |
| Sidebar: client-dependent links disabled without client | ✅ (covered in navigation.spec.js) |
| Basic auth / login flow | ✅ (`welcome/login.spec.js`, 1 test: 401 + WWW-Authenticate without creds) |
| Logoff | ✅ (`welcome/login.spec.js`, 2 tests: app loads with creds; logoff button → logoff.html 401) |
| Global search (client search box) | ✅ (`clients/search.spec.js`, 4 tests) |
| Hotkeys | ✅ (`sidebar/hotkeys.spec.js`, 5 tests: alt+d/a/n/c + ctrl+shift+/) |
| i18n strings render (no raw keys) | — N/A: GUI has no i18n framework (no react-i18next; `t(` matches are api.get/api.post calls) |

---

## Priority order (risk-based)

1. **Server Artifacts / Collected Artifacts** — done (12 tests: 7 view + 4 actions + 1 lifecycle E2E).
2. **Notebooks** — done (14 tests: 7 view + 5 actions + 1 error + 1 lifecycle E2E).
3. **Users** — done (13 tests: 10 view + 2 actions + 1 lifecycle E2E).
4. **Events** — done (14 tests: 13 view + 1 lifecycle E2E).
5. **Secrets** — done (5 tests: 3 view + 1 actions + 1 lifecycle E2E).
6. **VFS / Dashboard** — done (7 tests: 4 VFS + 3 dashboard).
7. **Client Events** — done (4 tests).
8. **Host Info** — done (8 tests).
9. **Hunt Manager** — done (14 tests: 6 view + 7 actions + 1 lifecycle E2E).
10. **Cross-cutting (login/logoff, hotkeys)** — done (8 tests: 3 login/logoff + 5 hotkeys).

## How to use this matrix

- Before writing a test, check the cell exists here (or add it).
- When a cell is intentionally skipped, mark it `—` with a reason.
- Run the full suite after every change to the GUI; any red test
  = behavior regression to fix before proceeding.
