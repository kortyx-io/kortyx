# Table preferences and saved views

Studio stores table layouts, default sorting/page size, and named views in the
API's PostgreSQL database. A scoped localStorage cache renders after mount without
waiting for preference reads. The table then refreshes from the database in the
background. Preference reads are never awaited by page rendering. The existing
shell context supplies only an opaque owner/project cache namespace, not the
preference data.

## Ownership

Self-hosted API-key access uses one shared project profile. Changes require
`studio:write`; project readers can read it. Cloud human access uses the verified
`ApiHumanPrincipal.userId` within the authorized organization/project. A user with
`studio:read` can personalize their own tables without permission to modify
execution data. Cloud API keys cannot access personal preferences and never fall
back to project ownership. Key rotation does not change the project profile.

Studio's unauthenticated development mode (`KORTYX_STUDIO_AUTH_MODE=none`) keeps
preferences in the scoped browser cache only. When verified project context is
unavailable, preferences remain in memory; Studio does not read an unidentified
user's cache. Basic Auth does not identify different people: everyone sharing
access to a self-hosted project shares its database preferences.

The API resolves ownership from the verified principal. Request bodies cannot
supply user, organization, project or owner-kind fields. Each write also carries
the expected opaque cache scope, so a changed session cannot save an old tab's
preferences into another user's profile. The namespace is not an authorization
credential. Requests remain independently authorized.

## Cache and save behavior

The shared provider maintains a cache and a bounded write queue per owner/project
and stable table ID. The cache key is
`kortyx.table-cache.v1.<opaque-scope>.<table-id>`. It contains the last database
snapshot and pending local operations. Existing unscoped localStorage and cookie
views are not imported into database preferences.

Column edits apply immediately. Default-setting writes coalesce for 500 ms;
named-view operations retain stable IDs. The queue survives refresh when browser
storage is available. Browser storage failure does not prevent database saves.
Returning to a table or focusing the window refreshes a clean cache. A late read
preserves pending local edits. Preferences do not overwrite explicit URL sort or
page-size values, or interactions made while preferences were loading.

The database compares revisions inside a transaction. Conflicts never silently
replace another client's changes. Studio displays **Preferences not saved** and
offers **Save my changes** (read the latest revision and replay pending operations)
or **Reload preferences** (discard the pending changes present when reload was
requested). Edits made while that reload is in flight are retained. A failed
request leaves changes cached and offers Retry. Account/project changes and read
access denial clear the old in-memory/cache snapshot and require a page reload;
shared-profile write denial preserves local edits and explains read-only access. Requests time out after ten
seconds. Up to 100 pending operations are retained; consecutive default changes
coalesce. Browser storage can be cleared by the browser and is not a backup for
unsaved changes.

Views capture conditions, search/scope, layout, sorting and page size. Pagination
cursors are never saved. Automatically persisted defaults contain layout and
sort/page-size preferences, not current search/filter values. New columns are
appended and unknown columns are ignored when restoring a layout. Tables share
the same persistence behavior without feature-owned storage code.

## Storage and API

`studio_table_preferences` has an ID, organization/project, `owner_kind`, nullable
`user_id`, stable `table_id`, defaults, revision and timestamps. Constraints require
project owners to have a null user and user owners to have a user FK. Partial
unique indexes enforce one profile per owner/project/table. Project and user
removal cascade. `studio_table_views` stores one bounded definition per stable
view ID under its parent preference row; parent deletion cascades.

`GET /v1/studio/table-preferences/:tableId` returns `{ scope, preferences }`.
`POST` accepts `{ scopeKey, expectedRevision, operation }`. Operations update
defaults, upsert one view, or delete one view. A stale revision returns 409.
Bodies are bounded to 128 KiB. Named views are limited to 30 per table. The table
registry and versioned Zod contracts live in `@kortyx/telemetry-contracts`.
Register a new stable table ID there when adding a table. The Studio same-origin
proxy validates authentication, mutation origin, custom request header and body
size, and forwards only server-owned API credentials and project scope.

Sample-project table choices use a separate browser-only cache and never read or
write real project preferences. Current-page help explains ownership and recovery;
existing sample chapter identities and recorded evidence remain unchanged.

## Deployment and future cloud migration

Apply migration `0014_studio_table_preferences` and deploy the API before Studio.
Old API context responses remain readable; an older API cannot enable database
preferences. Existing table preference keys are left untouched, but are not
uploaded. Rolling back the UI leaves the new tables harmlessly unused; do not
drop them as part of a rollback.

Cloud integrations must return verified human principals and apply their tenant
transaction/RLS policies to both tables. The views policy must check ownership
through the parent row. Existing auth and tenant-database extension contracts are
unchanged. The shared feature implements personal cloud ownership, API persistence, and
owner/project cache isolation. PostgreSQL-backed cloud-mode API tests cover two
users across projects/organizations, persisted named views, scope mismatch, and
revision conflicts. Studio tests verify that cloud scope enables background
persistence. These test the shared feature through the existing adapter contracts;
they do not claim verification of a private deployment’s RLS policies.

`StudioTableConfigurationSchema` is a versioned portable payload containing only
configuration and stable view IDs. It excludes database ownership and revision.
A future self-hosted-to-cloud migration can map the source project to a selected
destination and assign imported configurations to the authenticated importing
user. Repeated imports can upsert stable view IDs; resource-specific filter
references will need mapping or an explicit unresolved-reference result. This
change does not add the migration button or an import endpoint.

## Verification

Run Studio unit tests (including delayed reads, conflicts and cache isolation),
API authorization/proxy tests, contract validation, and PostgreSQL persistence
integration tests. The database regression is included in `test:integration` and
normal database tests. Existing table browser regressions remain applicable.
Run browser E2E in CI, not locally.

Manual checks should cover saving/reloading a view, column visibility persistence,
a second client's stale edit followed by explicit conflict recovery, and a slow or
failed preference request while the page remains usable. Check the actual database
response to distinguish a cached edit from a completed save. Usage telemetry
retains the existing bounded table/view operations and never includes saved view
names, filter values or cache contents. Execution tracing and SDK behavior are
unchanged.
