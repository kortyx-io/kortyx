---
id: v0-studio-prompts
title: "Version and Test Prompts"
description: "Manage prompt versions, test candidates with your application, and promote verified versions."
keywords: [kortyx, prompts, versioning, configuration, evals, groups]
sidebar_label: "Prompts"
section: "guides"
---
# Version and test prompts

Open **Prompts → Library** to create prompts. Each prompt has a stable key, a display
name, immutable versions, a shared draft, and separate environment assignments.
Renaming or moving a prompt never changes the key used by your application.

Choose **System + user** for two messages, or **Ordered chat messages** for a
conversation with system, user, and assistant messages. Declare template inputs
in the input JSON Schema and reference them with `{{message}}` or dotted paths
such as `{{customer.name}}`. The application supplies these values at runtime.

**Configuration** stores values returned as `prompt.config`, such as a model
alias or temperature. These values are validated against the configuration schema
and the application's registered contract. Configuration is never substituted
into messages. Keep credentials in the application's secret store.

## Review and save

**Edit as draft** autosaves valid changes. **Save version** opens the same diff
dialog used by **Compare**: removed content is red, added content is green, and
desktop views align both versions. Narrow screens use a unified diff. Choose any
two versions when comparing; saving compares the reviewed candidate with the
current head and requires a change note.

Messages, configuration, format, contracts, and exact dependencies contribute to
the executable hash. A note-only change cannot create another executable version.
Concurrent changes to the head, draft, or assignment are rejected; your local draft
remains available for recovery. Retrying an accepted save with the same idempotency
key does not create another version.

## Categories and test groups

Categories organize the library. **New category** accepts paths such as
`Canvas/Testing`, creating Testing under Canvas. Parents collapse independently.
Category actions rename, move, or delete the category. Deleting a category requires
choosing Root or a surviving category for every prompt in its subtree.

**Test groups** are secondary collections of exact prompt versions. Open Groups,
name a group, and add versions from the prompt history or group drawer. A group
contains one version per prompt; replacing that selection requires an explicit
choice. Deleting a group preserves prompts, versions, and saved eval evidence.

A group does not own or save a suite. **Run suite** opens the normal eval drawer,
where you choose an application, suite, individual test checkboxes, judge, and
attempts. The optional prompt selection chooses environment assignments, one
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
versions cannot satisfy a promotion policy. **Runs** shows model calls linked by
key, version, hash, environment, and source. Captured message content follows the
application's existing telemetry capture policy; configuration and runtime inputs
are not added to identity metadata.

Promotion policies can require a passing full suite, specific application/suite
selections, and independent human reviews. Evidence must come from the destination
environment and its companion versions must still match that environment's
assignments. API-key reviews are audited but do not count as independent human
reviews. When allowed by policy, an explicit exception requires a reason and is
recorded in Activity. Bootstrap an initial assignment through that reviewed
exception path, or first test a candidate in the destination environment.

**Promote** assigns an exact version using the current assignment revision.
**Rollback** assigns an earlier immutable version through the same policy checks.
The assignment changes immediately; executions already holding a snapshot retain
it, and new executions resolve the new assignment. The Runs tab shows adoption.

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
CLI after a lost response. Import never changes environment assignments.
Bundles support up to 200 immutable versions and a 20 MiB transfer request;
individual prompt mutations are limited to 1 MiB.

Promotion checks the current application suite revision as well as destination
environment, exact prompt usage, companion versions, required suites, and reviews.
A previous pass from an older suite definition is historical evidence and does
not satisfy the current promotion gate.
