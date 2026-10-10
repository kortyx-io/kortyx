---
id: v0-studio-prompts
title: "Version and Test Prompts"
description: "Manage prompt versions, test candidates with your application, and promote verified versions."
keywords: [kortyx, prompts, versioning, configuration, evals, groups]
sidebar_label: "Prompts"
section: "guides"
---
# Version and test prompts

Open **Prompt Management → Prompts** to create prompts. Each prompt has a stable key, a display
name, immutable versions, a shared draft, and a promoted `live` version, and optional version tags.
Renaming or moving a prompt never changes the key used by your application.

Each library row has an actions menu at the right edge, including rename, move,
code helper, promotion policy and archive/restore. Rename, move and code helper
open in modals. Archive and restore require confirmation, including bulk actions;
restoring preserves versions without making them live or assigning tags.

The editor shows system and user messages directly. **Add message** adds another
message with an explicit role for conversation examples. Messages are sent in the
order shown; additional messages require a `chat` application contract. Declare template inputs
in the input JSON Schema and reference them with `{{message}}` or dotted paths
such as `{{customer.name}}`. The application supplies these values at runtime.

**Configuration** stores values returned as `prompt.config`, such as a model
alias or temperature. These values are validated against the configuration schema
and the application's registered contract. Configuration is never substituted
into messages. Keep credentials in the application's secret store.

Configuration and both schemas use a JSON code editor with syntax highlighting,
line numbers, folding, bracket matching, automatic indentation and error markers.
**Format** applies two-space indentation without changing values. Undo and redo
work inside each editor; Tab moves to the next field. Invalid JSON stays visible
for correction and blocks saving. Saved versions keep syntax coloring in read-only mode.

## Include another prompt

Type `#` or choose **Include prompt** inside a message. Search by name or key;
append `@v9` to select an exact version or `@Latest` to select the newest saved
version. The violet reference chip shows the selected name and exact version.
Latest is resolved when selected, so the saved parent retains the version reviewed
and tested even after the included prompt changes.

An inclusion brings the matching message text: a system field includes system
messages, and a user field includes user messages. Multiple matching messages
join with a blank line. References can be nested. The editor imports input
declarations; your application contract and runtime values must include those
inputs. Configuration stays with the parent prompt.

The immutable dependency manifest records every selected key, version, and hash.
Serving and evals expand from the same frozen snapshot, and included prompts have
actual-use receipts and linked model runs. Missing versions, conflicting pins,
cycles, incompatible message roles, and oversized expansions are rejected.
Export/import and CLI migration include the dependency closure and rewrite
reference keys when renaming prompts at the destination.

Template inputs such as `{{message}}` are blue; prompt inclusions are violet.
The editor preserves plain prompt text and line breaks when pasting or saving.

## Review and save

Saved versions are read-only. **+ New version** creates a draft from the newest
saved version, including messages, configuration, schemas and prompt references.
If a draft already exists, **Open draft** resumes it.

The **Draft** entry stays at the top of version history until saved or deleted.
You can browse saved versions and other tabs, then return to the draft. Valid
changes autosave and are flushed when leaving the prompt. Invalid JSON remains
in the mounted editor while browsing versions and tabs.

**Save version** opens the same diff dialog used by **Compare**: removed content
is red, added content is green, and desktop views align both versions. The diff
compares the draft against its recorded base version and requires a change note.
Accepting creates a new immutable version and removes the draft entry. A changed
base or draft revision causes a conflict instead of silently replacing content.

Use **Delete draft** in the actions menu to remove the draft after confirmation.
Saved versions, live and optional tags stay unchanged. A newer draft saved by
another editor cannot be deleted using an outdated revision.

Messages, configuration, format, contracts, and exact dependencies contribute to
the executable hash. A note-only change cannot create another executable version.
Concurrent changes to the head, draft, or assignment are rejected; your local draft
remains available for recovery. Retrying an accepted save with the same idempotency
key does not create another version.

## Version reviews

Open a prompt, select a version, and choose **Reviews** to see its saved notes,
reviewers, timestamps, and independent-review status. **Review this version**
opens a modal from the tab or the version menu. After submitting, Studio opens
that version’s Reviews tab. Submitting another review as the same reviewer
updates the existing note for that version. Reviews of other versions stay separate.

Independent human reviews can satisfy promotion requirements. Notes from the
version’s author or an API key remain visible but do not count as independent.

## Categories and test groups

Categories organize the library. On smaller screens, use the categories control
on the left to open the category tree. Selecting a category closes the panel.
**New category** accepts paths such as
`Canvas/Testing`, creating Testing under Canvas. Parents collapse independently.
Category actions rename, move, or delete the category. Deleting a category requires
choosing Root or a surviving category for every prompt in its subtree.

**Test groups** are secondary collections of exact prompt versions. Open Groups,
name a group, and add versions from the prompt history or group drawer. A group
contains one version per prompt; replacing that selection requires an explicit
choice. Removing a prompt from a group and deleting a group require confirmation.
Both preserve prompts, versions, and saved eval evidence.

A group does not own or save a suite. **Run suite** opens the normal eval drawer,
where you choose an application, suite, individual test checkboxes, judge, and
attempts. The optional prompt selection chooses live versions, one
candidate version, or a test group for this launch. You can test a single candidate
without creating a group.

## Evidence and promotion

The consumer application's `createPrompts` registration advertises its contracts
through `createEvals`. Studio freezes all registered prompt versions, replacing the
selected candidates, and validates configuration before starting the run. Companion
prompts and exact dependencies remain part of that snapshot.

**Evals** on a prompt shows the saved run, selected version, full-suite status, and
actual-use verification. A selection alone is not proof: `useReason({ prompt })`
records the version and hash actually passed to the model. Unused or mismatched
versions cannot satisfy a promotion policy. **Runs** shows executions that reported
this version, with model-call provenance linked by key, version, hash, environment,
and source. Captured message content follows the
application's existing telemetry capture policy; configuration and runtime inputs
are not added to identity metadata.

Both tabs use the standard Runs and Evals tables, filling the available tab area.
Search, status filters, sorting, column controls, and pagination work within the
selected version. All tabs share the same version history: a collapsible sidebar
on wide surfaces and a dropdown beside the tabs in narrow drawers or mobile
layouts. Drawer and expanded views share one compact header. Expand changes to
Back in expanded view; secondary actions move into the prompt menu when space
is limited.
Multiple calls in one execution produce one run row; suites launched together
produce one evaluation row, retaining their prompt-usage evidence.

**Make this live** is the first action in each version menu. It opens a modal
labelled **Promote version** for a newer version or **Roll back version** for an
older version, relative to the current live version. Review the exact version,
readiness checks, and release impact, then confirm with **Promote** or **Roll back**
in that same modal. There is no second confirmation dialog or environment selector:
live belongs to this prompt in this project.

Saving a candidate never moves live. Rolling back moves live to an older immutable
version; **Newest version** still shows the most recently saved version. New
executions resolve live by default, while executions holding a snapshot retain it.

**Manage tags** adds or removes optional version tags such as `staging` or
`development`. Each tag points to one version of a prompt. Moving or removing an
existing tag requires confirmation because applications may request it. Tags do
not promote a version, and promotion never moves optional tags. The reserved
`live` tag can only move through promotion or rollback. Tag names use lowercase
letters, numbers, hyphens and underscores, up to 64 characters. Tags are scoped
to the project and do not create application environments or copy prompts between
projects or deployments.

Promotion policies can require a passing full suite, specific application/suite
selections, and independent human reviews. Evidence must use the exact version
and its companion versions must still match current live versions. Each policy
applies to all versions of one prompt; changing it does not affect other prompts.
API-key reviews are audited but do not count as independent human reviews. The modal explains unmet requirements before submission. When allowed
by policy, an explicit exception requires a reason of at least 10 characters and
is recorded in Activity. Test a candidate before the first promotion, or use that
reviewed exception path to bootstrap live. Open **Promotion policy** from a prompt’s
row actions or detail actions. It opens one modal; the table action keeps you on
the list. **Save policy** confirms the changes and records them in that prompt’s
Activity. Cancel closes the modal without saving.

## Connect an application

Follow [Studio prompt SDK integration](../../sdk/v0/03-guides/27-studio-prompts.md).
The prompt's **Code helper** includes its real contracts and version pin. Use a
server-side key with `prompt:serve`; editing and promotion use separate Studio
permissions. Local Studio bootstrap enables prompt management with
`KORTYX_STUDIO_ENABLE_PROMPTS=1`. Eval execution additionally needs
`KORTYX_STUDIO_ENABLE_EVALS=1` and a registered consumer target.

See [Migrate prompts between deployments](./14-prompt-migration.md) for CLI
authoring and staging-to-production migration.

## Bulk management and import

Select up to 100 library rows to move prompts, select their exact latest versions
for a test group, export a bundle, or archive unassigned prompts. Category and
archive batches are atomic: a stale revision rejects the entire batch. Assigned
prompts remain protected from archive.

**Import** accepts portable JSON bundles exported by Studio or the CLI. Review
conflict handling, destination keys, category paths, and optional test groups,
then review the source-to-destination version mapping and hashes. Apply saves
candidate versions and reads each hash back. Save the plan to retry through the
CLI after a lost response. Import never changes live or optional tags.
Bundles support up to 200 immutable versions and a 20 MiB transfer request;
individual prompt mutations are limited to 1 MiB.

Promotion checks the current application suite revision as well as
exact prompt usage, companion versions, required suites, and reviews.
A previous pass from an older suite definition is historical evidence and does
not satisfy the current promotion gate.
