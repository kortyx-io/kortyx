---
id: v0-studio-prompt-migration
title: "Author and Migrate Prompts with the CLI"
description: "Read, modify, test, and transfer exact prompt versions across projects or independent OSS deployments."
keywords: [kortyx, prompts, cli, migration, staging, production]
sidebar_label: "Prompt CLI and migration"
section: "guides"
---
# Author and migrate prompts with the CLI

Use independently authenticated named connections for the source and destination.
Connections store API URLs and environment-variable names, rather than raw keys.
`--project-id` on `kortyx connections add` selects a cloud project explicitly.

```sh
kortyx connections add staging --api-url https://staging-api.example.com --api-key-env STAGING_STUDIO_KEY
kortyx connections add production --api-url https://production-api.example.com --api-key-env PRODUCTION_STUDIO_KEY
kortyx studio prompts list --connection staging --json
kortyx studio prompts get canvas/classify-intent --connection staging --file prompt.json
kortyx studio prompts validate prompt.json --json
```

Modify the executable JSON file, validate it, and review the hash before saving:

```sh
kortyx studio prompts update canvas/classify-intent --connection staging \
  --file prompt.json --base-version 1 --expected-hash REVIEWED_HASH \
  --note "Improve ambiguous intent classification" --idempotency-key SAVE_UUID --json
kortyx studio prompts diff canvas/classify-intent 1 2 --connection staging --json
kortyx studio prompts test canvas/classify-intent --connection staging \
  --version 2 --target support-app --suite regression --case ambiguous-intent --json
```

`edit` is an alias of file-based `update`. `versions` lists identities and notes.
`action <file>` validates and applies category, group, draft, review, policy, or
asset mutations using the public action contract. `archive` and `restore` require
the reviewed asset revision. Assigned prompts cannot be archived.

## Plan, apply, verify

```sh
kortyx studio prompts copy canvas/classify-intent --from staging --to production \
  --plan-file transfer-plan.json --json
# Review the source-to-destination version/hash mapping, then apply:
kortyx studio prompts apply transfer-plan.json --connection production --json
```

The default copy exports the selected head and its exact dependency closure.
Use `--version` for one exact version or `--history` for histories, `--groups` for fully covered test groups, and
`--rename source/key=destination/key` for intentional key remapping. An unrelated
same-key conflict fails by default; `--append` explicitly allows new destination
versions. Identical executable content is reused. Category paths are portable;
internal category and prompt UUIDs are destination-owned. Dependency keys,
versions, and hashes are remapped together, so rewritten parents receive new
executable hashes while retaining their source provenance.

Plans freeze destination heads and expire after 24 hours. Applying a plan is
atomic: concurrent destination edits or group conflicts reject the operation.
Save the plan before applying; retrying that plan resumes the accepted operation
without duplicating versions. CLI apply reads destination versions back and checks
their exact hashes before reporting `verification: "destination-read-back"`.

Copying never changes live assignments and never moves source keys, traces, eval
results, or review approvals. Source identity and immutable version/hash provenance
are retained. Run the imported version against the destination application's suite,
then explicitly promote it under destination policy:

```sh
kortyx studio prompts test canvas/classify-intent --connection production \
  --version DESTINATION_VERSION --target support-app --suite regression --json
kortyx studio prompts promote canvas/classify-intent --connection production \
  --version DESTINATION_VERSION --environment production --expected-revision 0 --json
```

For disconnected deployments, use `export <key...> --file bundle.json` and
`import bundle.json --plan-file transfer-plan.json`. `--apply` combines planning
and application when the mapping is already controlled by your automation.

CLI failures use nonzero exit codes. `--json` reports versioned errors, including
prompt conflict codes, without reflecting arbitrary remote response bodies.
