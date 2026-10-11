---
name: add-new-package
description: Use when adding any new publishable package in this monorepo (packages/* or providers/*). Covers package scaffolding, release automation wiring, and CI/publish checks.
---

# Add New Package

## Purpose

Ensure every new package is publish-ready and wired into release/publish automation on day one.

## Mandatory Inputs

- package path (for example `packages/stream` or `providers/google`)
- npm package name (for example `@kortyx/stream` or `@kortyx/google`)
- initial version (usually `0.1.0` for new packages)

If any are missing, ask before proceeding.

## Required References

1. `.github/release-please/config.json`
2. `.github/release-please/manifest.json`
3. `.github/workflows/npm-publish.yml`
4. `pnpm-workspace.yaml`
5. an existing package `package.json` in the same root (`packages/*` or `providers/*`)

## Workflow

1. Create package skeleton:
- `src/`
- `package.json`
- `tsconfig.json` (extend `../../tsconfig.lib.json`)
- `tsconfig.build.json` (extend `./tsconfig.json` with relaxed strictness)
- `README.md`
- `CHANGELOG.md`

2. Ensure workspace inclusion:
- check `pnpm-workspace.yaml` includes the package root glob.
- if using a new root (not `packages/*` or `providers/*`), add it.

3. Wire Release Please:
- add `<path>` entry to `.github/release-please/config.json` with:
  - `package-name`
  - `component`
- add `<path>: <version>` to `.github/release-please/manifest.json`.

4. Wire npm publish workflow:
- confirm `.github/workflows/npm-publish.yml` discovers this package root.
- if package root is new, update discovery roots.

5. Verify package metadata:
- `private: false` for publishable packages.
- `repository.directory` matches package path.
- `files` includes built artifacts and docs.
- exports/types/main are valid.

6. Run checks:
- package build/type-check
- affected monorepo build/type-check

## Validation Commands

From repo root (replace `<path>` and `<name>`):

```bash
pnpm -C <path> build
pnpm -C <path> type-check
pnpm turbo run type-check --filter=<name>
pnpm build
```

## Done Criteria

- Package compiles and type-checks.
- Release Please includes the package path in config + manifest.
- Publish workflow can discover/publish the package root.
- No manual release steps are required for future versions.
