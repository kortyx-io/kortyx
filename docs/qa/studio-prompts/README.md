# Studio prompts verification

Verified against the production Studio build on 2026-10-08. All data shown is a local test fixture.

## Automated checks

- Root `pnpm build`: 32 successful tasks.
- Root `pnpm type-check`: 51 successful tasks.
- Root `pnpm coverage`: 39 successful tasks; existing coverage gates preserved.
- Root `pnpm lint`, dependency audit and `git diff --check`: passed.
- Studio: 244 tests passed, plus production/development auth-adapter smoke checks.
- API: 114 tests passed (2 unrelated optional tests skipped), plus real production/development security-adapter checks.
- Telemetry database: 198 tests passed against PostgreSQL, including fresh migration, tenant isolation, immutable versions, category/group mutations, promotion evidence and independent destination transfer.
- Website: 20 tests passed and 418 documentation routes built.
- Example application: authenticated transport tests passed against both source and destination deployments.
- Kortyx skill: metadata validation passed.

## Manual application and CLI checks

Ran two independent PostgreSQL/API deployments and two copies of the runnable prompt example. Created a system/user prompt, reviewed and saved a candidate with changed instructions and configuration, launched a complete suite from a test group, and launched one selected case directly against the candidate without a group. Attached evaluations correctly distinguished complete and selected tests and verified actual prompt usage.

After integrating the latest multi-suite evaluation flow, repeated the individual-case and full-suite group launches successfully. Regression checks confirm every child suite shares the same frozen baseline and retries retain it after group changes.

Promoted the tested candidate through Studio. A new application request resolved its exact version/hash from production, recorded generation provenance and kept the private prompt snapshot out of the public response.

Exercised CLI create/read/validate/update/diff/archive/restore/export and authenticated cross-deployment plan/apply. Read destination versions back to verify hashes; repeated the same transfer without duplicate writes; ran destination evaluations before destination promotion. Imported a CLI bundle through the Studio file picker and confirmed its destination hash and unassigned state.

Exercised nested category creation, rename, reparenting, bulk movement and group membership. Browser Back/Forward restored tab and launch state. Reviewed required change notes, promotion readiness, audited-exception controls and archived/read-only restrictions.

The example uses a deterministic provider and app judge for these integration checks. This verifies serving, execution, evaluation and migration behavior; it does not establish a live provider model’s semantic quality. Optional real-model configuration is documented in the example.

## Visual review

Inspected the real React UI in light and dark themes at 1440×1000, 768×1024 and 390×844. Checked library/category navigation, detail headers, history menus, comparison and save-review dialogs, group/eval/import drawers and promotion controls. Fixed narrow-header wrapping, diff footer wrapping and read-only format contrast. Tablet and mobile document widths matched their viewports; wide tables scroll inside their containers. Restored the original theme and viewport after testing.

### Drawer and table follow-up

Replaced the history sidebar with a version dropdown whenever the prompt's available content width is below 896px, including small drawers on wide screens. Wide prompt views retain the sidebar. Removed the prompt table's redundant bordered, rounded shell.

Reproduced and fixed nested editors covering parent content, menu typeahead expanding a route drawer, Escape dismissing both a menu/dialog and its parent, and loss of the Groups list ancestor when opening Group → Prompt. Prompt and group action panels now participate in browser Back/Forward; category list history correctly closes and restores prompt drawers.

The production build passed **31 browser checks** spanning the existing drawer-stack and responsive suites plus nine new prompt regressions and fixture setup/cleanup. The prompt suite also passed all **11 development checks** including setup/cleanup. Studio's **244 unit tests**, type checking and the production build passed after these changes. The new prompt regressions run in both development and production CI jobs.

Manually reviewed the final production UI on desktop, 768×1024 tablet and 390×844 mobile. Confirmed full-width message fields beside the compact selector, wrapped change notes inside its menu, and space reserved beside desktop inspectors. Temporary viewport overrides were reset after review.

![Flat prompt library table](desktop-library-flat.png)

![Compact history menu in a desktop drawer](desktop-history-menu.png)

![Prompt content alongside its nested inspector](desktop-inspector-spacing.png)

![Tablet prompt content using the compact history selector](tablet-history-content.png)

![Mobile version history menu](mobile-history-menu.png)

### Desktop version comparison

![Aligned messages and configuration differences](desktop-diff.jpg)

### Tablet prompt content

![Tablet prompt content and version history](tablet-content.jpg)

### Mobile attached evaluations

![Individual and full-suite evidence on mobile](mobile-evidence.jpg)

### Mobile individual-case launch

![Candidate prompt and individual case selection](mobile-eval-launch.jpg)

### Mobile save review

![Save review with required note and visible action buttons](mobile-save-review.jpg)


### Prompt editor and composition follow-up

Replaced message textareas with TipTap's native plain-text document, Mention and
Suggestion extensions. System and user fields occupy the available width; the
redundant message-format selector is removed. Template inputs are blue and
included prompt chips are violet. Additional chat messages remain available
through the message controls.

Verified exact-version selection and Latest through keyboard and mouse,
including picker dismissal without closing the prompt drawer. Latest pins the
selected saved version. Saved content persists stable-key tokens and exact
version/hash dependencies, rather than editable display names. Recursive
expansion preserves message roles and the parent's configuration. Invalid input
contracts, missing roles, cycles and oversized expansion are rejected.

The SDK compilation tests, real workflow evaluation test and PostgreSQL
integration checks verify expanded instructions, immutable dependency pins, and
parent/child usage receipts. Manual CLI create/read/export and independent
source-to-destination plan/apply/read-back verified renamed inline tokens and
dependency manifests; retrying the plan produced no duplicate versions. The
destination SDK resolved the rewritten parent and expanded the renamed child.
A separately registered example using the composed prompt passed a full suite
and one selected case through the CLI, with exact parent/child receipts and
attached evaluations/runs visible on both prompts. The Studio run drawer also
launched the composed candidate successfully, with 2/2 passing attempts.

The final combined drawer, prompt and responsive run passed all 35 checks in
production and development (33 scenarios plus fixture setup/cleanup). The native
prompt suite contributes twelve scenarios. Responsive locators assert displayed
surfaces while Next briefly retains hidden streamed markup.
Repository type checking passed all 51 tasks; prompt coverage passed its gates
with 19 tests. Studio's 244 unit tests and the production build passed.

Inspected the production editor and native inclusion menu on desktop, tablet
and mobile, then restored the browser viewport.

![Full-width native prompt editor](desktop-tiptap-editor.png)

![Native prompt and version picker](desktop-prompt-inclusion-picker.png)

![Tablet prompt editor](tablet-tiptap-editor.png)

![Mobile prompt editor](mobile-tiptap-editor.png)

![Completed evaluation of the composed prompt in the example application](composed-example-evaluation.png)

### First-frame drawer keyboard regression

Stress tests reproduced an intermittent Escape failure while revisiting
Run → Session → Run. Instrumentation showed the key reached the window without
a drawer listener installed. Keyboard ownership now updates in a layout effect,
in the same commit as the active surface. A new browser regression dispatches
Escape from the transition's DOM mutation microtask; it failed before the fix
and passed three consecutive development runs afterward. The existing native
Escape, nested inspector, menu and TipTap picker scenarios remain in the suite.

The CI shard also exercised Escape before Next had committed the new pathname.
Dismissal now waits for that route commit; newer navigation or browser history
cancels it. The first-frame and responsive checks passed three repeated
development runs. Responsive assertions target displayed content while retaining
all geometry checks, avoiding Next's transient hidden streamed copies.

Native undo/redo restores exact version/hash attributes on prompt mention nodes
and reconciles the dependency manifest. The regression deletes an included
prompt, undoes/redoes the deletion, then saves and verifies its immutable pin.
The final production build, Studio type check, repository lint, whitespace check
and all 244 Studio unit tests passed after these fixes.

### Full-area Runs and Evals tables

Prompt Runs and Evals tabs reuse the canonical run mapping and evaluation
columns. Version history stays in a compact dropdown on these tabs; the flat
table fills the available width and height, including its empty state, with
pagination anchored at the bottom. Search, status filtering, sorting, column
controls and row navigation use the platform components. Table query state is
isolated from the destination detail's query state.

Runs are deduplicated by execution ID; multiple generation receipts produce one
row. Multi-suite launches appear as one evaluation row with canonical progress,
results, application, trigger, cost and duration. Prompt usage remains visible
and includes suite selection, test groups and companion versions in its details.
The scoped API returns canonical rows for the selected version, preserving
legacy suite links and enforcing project/environment permissions.

New regressions exercise actual populated database rows, duplicate receipts,
Run drawer nesting/restoration, eval navigation, and full-area empty tables at
1440px, 768px and 390px. API integration checks cover evaluation grouping,
empty run selection, invalid versions and serve-only authorization.

![Prompt Runs table](desktop-prompt-runs-table.png)

![Prompt Evals table](desktop-prompt-evals-table.png)

![Mobile Prompt Evals table](mobile-prompt-evals-table.png)

Final validation after this change: **41 browser checks passed in development
and 41 in production** (39 scenarios plus fixture setup/cleanup), including
all evaluation launch, drawer-stack, prompt and responsive scenarios. All
**244 Studio unit tests**, the PostgreSQL-backed prompt API integration test,
**51/51 root typecheck tasks**, repository lint, API build and production
Studio build passed. The local API was restored to the example application
targets after the fixture-based checks.
