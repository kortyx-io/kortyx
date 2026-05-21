# Kortyx Website

[![CI](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/ci.yml)
[![Website Image](https://github.com/kortyx-io/kortyx/actions/workflows/website-ghcr.yml/badge.svg)](https://github.com/kortyx-io/kortyx/actions/workflows/website-ghcr.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/kortyx-io/kortyx/blob/main/LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-app-000000.svg)](https://nextjs.org/)

Documentation and product website for Kortyx.

## Development

Run from the repository root:

```bash
pnpm --filter kortyx-website dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Build

```bash
pnpm --filter kortyx-website build
```

The build script generates docs last-updated metadata before running `next build`.

## Content

- `src/app`: Next.js app routes and shell.
- `src/docs/v0`: versioned markdown docs.
- `src/components`: shared UI components.
- `scripts/generate-docs-last-updated.mjs`: docs metadata generation.

## Documentation Entry Points

- [Start here](./src/docs/v0/00-start-here/README.md)
- [Installation](./src/docs/v0/01-getting-started/01-installation.md)
- [Quickstart: Next.js API Route](./src/docs/v0/01-getting-started/02-quickstart-nextjs.md)
- [Package overview](./src/docs/v0/05-reference/01-package-overview.md)

## Checks

```bash
pnpm --filter kortyx-website type-check
pnpm --filter kortyx-website lint
```

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
