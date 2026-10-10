# Studio prompt management

Implementation design, updated 2026-10-09. The website guides describe the supported public interfaces:

- [Prompt management](../../apps/website/src/docs/studio/v0/13-prompts.md)
- [Migration between deployments and projects](../../apps/website/src/docs/studio/v0/14-prompt-migration.md)
- [SDK integration](../../apps/website/src/docs/sdk/v0/03-guides/27-studio-prompts.md)
- [Runnable application](../../examples/kortyx-prompts/README.md)

## Product decisions

Prompts have their own sidebar section. Categories organize the library; test groups are secondary named selections of exact prompt versions. A group stores no suite, target or SDK setting. Any compatible application suite can run against a group, one candidate version, or live versions using the existing eval launch drawer and case checkboxes.

A prompt version contains ordered role messages, an input schema, saved configuration and its independent schema, exact dependencies, a content hash, author and change note. System + user preserves both roles. Chat preserves the complete message order. Template variables fill placeholders; saved configuration is returned as `prompt.config`. Application code explicitly maps model names and settings to its providers. There is no percentage rollout, implicit model routing or render-preview feature.

Editing autosaves a shared draft with optimistic concurrency. Saving always opens the same diff modal used for version comparisons: aligned red/green line and word differences on desktop, stacked differences on mobile, and a required change note. The acceptance binds the reviewed content hash, current head, draft revision and retry key. Concurrent edits keep the local draft available for recovery/export. Version history is immutable; editing a historical version creates a new candidate.

Historical version menus offer compare, edit, test, group membership, review, promote/rollback, code helper and portable export. Detail tabs expose attached evaluations, actual generation runs, saved reviews, and audit activity for the selected version. Tests are evidence only after the application reports the exact version/hash, environment and frozen snapshot revision. Partial suites remain useful results but cannot satisfy complete-suite promotion requirements.

Categories use stable UUIDs, hierarchical slash-path creation, collapsible parents and rename/move/delete actions. Reparenting preserves prompt keys and moves a complete subtree. Cycles, duplicate sibling names and excessive depth are rejected. Deleting a category requires a destination outside the deleted subtree for all affected prompts. Deleting a test group preserves its prompts and historical evaluations. Bulk category/archive mutations are atomic and check every asset revision; assigned prompts cannot be archived.

## Research and repository patterns

- [LangSmith management](https://docs.langchain.com/langsmith/manage-prompts): selected version content, history, diffs and explicit promotion. Adopt separate edit/save/promote actions.
- [Google Docs history](https://support.google.com/docs/answer/190843?hl=en) and [Notion history](https://www.notion.com/help/duplicate-delete-and-restore-content): author/time context and preview before restoration. Editing history creates a draft; history remains immutable.
- [Braintrust playgrounds](https://www.braintrust.dev/docs/evaluate/playgrounds): side-by-side comparisons, row reruns and persistent experiments. Apply these to real application evaluations.
- [Langfuse experiments](https://langfuse.com/docs/evaluation/experiments/experiments-via-ui): preserve the distinction between isolated prompt tests and application execution.
- [Langfuse caching](https://langfuse.com/faq/all/old-prompt-version-caching): promotion and observed adoption are different. Show actual versions and fallback/cache status.
- [Code/registry drift](https://www.reddit.com/r/GPT3/comments/1i6gykt/cant_figure_out_a_good_way_to_manage_my_prompts/), [workflow testing](https://www.reddit.com/r/LangChain/comments/1ctk5l5/struggling_with_prompt_management_tools/), [experiment metadata](https://forum.langchain.com/t/viewing-experiment-metadata-such-as-model-and-prompt-for-langsmith-evaluations/1602): ownership, real workflow tests and visible provenance address reported frustration. These are anecdotes, not representative statistics or current product-gap assertions.

## Platform UI integration

Canonical routes are `/prompts`, `/prompts/categories/[categoryId]`, `/prompts/[promptId]`, `/prompts/groups` and `/prompts/groups/[groupId]`. Stable key links resolve through `/prompts/by-key/[...key]`. Entity navigation uses routes; nuqs handles selected versions, tabs, editing, expansion, filtering and launch state. Templates, configuration and credentials never enter the URL.

The library reuses the platform DataTable, dropdowns, buttons, category navigation and pagination. Prompt details retain one compact header across drawer, expanded and direct-page views. Drawer actions sit before Close, secondary actions move into the menu on narrow containers, and compact history shares the tabs row. Expansion switches the leading Expand control to Back and removes the shared drawer shadow with the backdrop. Promotion policy opens in a shared modal from either row or detail actions; opening it from a row never navigates to the prompt drawer. Save policy submits once, Cancel does not write, and browser Back/Forward restores the modal through nuqs. Groups open through an intercepted platform drawer, with nested membership and suite launch inspectors. Direct navigation renders canonical pages. The original eval drawer retains app/suite/judge/repetition/case controls and adds live, single-version and optional group selection. Application contracts filter compatible prompt selections. Frozen configuration is shown in the existing eval run configuration view.

Search is server-backed and paginated; large libraries do not require downloading every prompt. Older history can be loaded incrementally or requested by exact version. Read-only users can inspect/copy content while write, review, promotion and settings actions use their separate permissions. Route boundaries surface recoverable loading and request failures.

## SDK and execution

`definePrompt` defines the typed interface and stable key. `createPrompts` registers those interfaces and a Studio or local source on an agent. `usePrompt(ref, { variables, version? })` returns compiled ordered messages, typed configuration and provenance; `useReason({ prompt, model, ... })` consumes the authentic compiled object without flattening roles. Groups remain entirely in Studio.

The execution resolves an atomic baseline once, freezes eval overrides before running the app, and preserves snapshots in private checkpoints across resume/fork. Public completion events omit private prompt snapshot/configuration state. Eval overrides are installed through the authenticated machine handler, not ordinary public chat input. Application and stored contracts are validated before model execution.

Serving uses an authenticated project/environment-bound snapshot endpoint. Dependency closure and content hashes are checked. Timeout/response bounds protect consumers. Optional last-known-good fallback is bounded by age, selected tag, environment, origin and authenticated key identity; authorization and malformed-contract failures never silently fall back. Prompt identity is recorded independently of content-capture settings, alongside the effective model on generation telemetry.

## Evaluation and promotion

Each launch freezes exact prompt versions and the live baseline in the existing eval request. Single-prompt testing needs no group. Group edits and assignment changes after launch cannot alter that run. Application observations report actual prompt receipts; unused, mismatched or different companion contexts are explicit evidence states.

The reserved `live` tag identifies the promoted version per prompt and project. Saving never moves live; rollback can make an older saved version live without changing the newest version. Optional named tags are manually added, moved or removed independently. They can implement staging/development logic without binding versions to project environments. SDK sources default to live and may request another tag; missing tags fail. Actual API-key environment authorization and telemetry context remain separate.

**Make this live** is first in version menus and opens a modal labelled Promote or Roll back according to the current live version. Promotion/rollback checks live's revision in a transaction and records audit activity. Each prompt has its own policy, shared by its versions, which can require complete verified tests, selected suites and independent human reviews. The current application manifest's suite revision must match the recorded pass, and companion prompts must match current live versions. Author/key-only reviews do not satisfy independent human review requirements. Allowed policy exceptions require a reason. Migrated source evaluations do not satisfy destination requirements. Optional tag changes bypass promotion policy by design and never update live. Moving/removing tags requires confirmation.


## CLI and migration

The CLI supports list/get/versions/diff, offline validate, create, update/edit from JSON, generic category/group/draft/policy/review actions, test with optional cases, promote/rollback, tag/untag, archive/restore, export/import/copy and apply. Writes create immutable versions with explicit note, reviewed head/hash and retry keys. Machine-readable output includes a schema version and safe structured errors. Connection profiles identify deployment/project/environment and reference credentials by environment variable.

Portable bundles contain templates, configuration/contracts, exact dependency closure and optional categories/groups. They exclude credentials, assignments, telemetry, evaluations, reviews and policies. Copy works between independently authenticated deployments or projects. Planning freezes destination state and records an actor-bound, expiring mapping. Same-key different content stops by default; append or rename is explicit. Apply remaps exact dependencies, recomputes affected hashes, commits atomically and supports exact retry. The CLI and Studio read every mapped destination version back to verify its hash before reporting completion. Destination eval and promotion are separate explicit steps.

## Storage and deployment

Migration `0009_prompt_management.sql` adds tenant-scoped categories, assets/drafts/versions, assignments, groups/members, reviews, policies, audit activity and transfer plans. Migration `0010_prompt_live_tags.sql` converts named assignments to tags, seeds live from the former production assignment, and consolidates project promotion policy/reviews while retaining previous records in the audit log. Migration `0011_prompt_scoped_policies.sql` copies each existing project policy to its prompts and scopes subsequent reads, changes, audit and promotion checks by prompt ID. New prompts start with the standard default policy. Existing eval requests store frozen snapshots and existing generation events carry prompt provenance. Project-level locking makes serving snapshots consistent with mutations and prevents partial category/group/transfer updates. Existing telemetry cleanup does not delete prompt assets.

Local bootstrap and CLI Compose enable the prompt capability and permission scopes. Studio uses its existing server credential and same-origin proxy with bounded bodies, route allowlisting and project/environment context. SDK serving has a separate narrow permission. Cloud adapters supply the same permission and target interfaces. Imports remain candidates and require destination validation before serving.

## Verification

Regression coverage includes role-preserving compilation, typed variables/configuration, hash/dependency checks, private resume/fork snapshots, strict eval overrides, actual usage, content-capture separation, tenant/environment/permission isolation, stale suite promotion rejection, immutable version/draft CAS, atomic bulk changes, category cycle/rehome behavior, group preservation, and independently authenticated PostgreSQL transfer/retry/hash verification.

The reproducible example supplies a deterministic model and app judge for transport/protocol E2E, with optional explicitly configured provider models. Deterministic checks establish integration behavior; they do not measure a live model's semantic quality. Manual Studio testing exercises save diff, individual/group suite launch, live promotion, attached evidence, categories, bulk moves and actual CLI-bundle import. Responsive review checks the real production React UI at desktop, tablet and mobile sizes in both themes, including header wrapping, modal/drawer actions and document overflow.

## Prompt editor and inclusions

The message editor uses TipTap with native Mention/Suggestion and popup mounting,
plain text serialization, undo/redo and a small template-variable decoration.
Content uses the full available width. System/user messages are visible directly;
the format selector is removed. Add message exposes roles and conversation order.
Blue placeholders remain dynamic code inputs; violet prompt mentions persist
stable-key tokens backed by exact dependency versions/hashes. Latest resolves
before saving so comparisons, evals and serving remain reproducible. Inclusions
expand matching roles and import input declarations; configuration stays with
the parent. Nested expansion rejects cycles, conflicting/missing pins, missing
roles and messages exceeding 200,000 characters. Included versions appear in
actual eval receipts and linked runs. Migration rewrites renamed reference keys.

Reviews use a platform modal and a dedicated version-scoped Reviews tab with count, reviewer, timestamp, note and independence status. Successful submission opens the reviewed version’s tab; re-submitting updates that reviewer’s note without duplicating it.
