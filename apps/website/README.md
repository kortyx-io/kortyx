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
- `src/docs/sdk/v0`: SDK markdown docs.
- `src/docs/studio/v0`: Studio markdown docs.
- `src/components`: shared UI components.
- `scripts/generate-docs-last-updated.mjs`: docs metadata generation.

## Documentation Entry Points

- [SDK start here](./src/docs/sdk/v0/00-start-here/README.md)
- [Installation](./src/docs/sdk/v0/01-getting-started/01-installation.md)
- [Quickstart: Next.js API Route](./src/docs/sdk/v0/01-getting-started/02-quickstart-nextjs.md)
- [Package overview](./src/docs/sdk/v0/05-reference/01-package-overview.md)
- [Studio overview](./src/docs/studio/v0/01-overview.md)

## Products and Versions

`/docs` is the product landing page. The product registry in
`src/lib/docs/config.ts` controls the product selector, landing cards, versions,
and overview page. Products have independent release histories.

Latest docs use `/docs/sdk/...` and `/docs/studio/...`; previous majors use
`/docs/<product>/vN/...`. Explicit latest-version URLs redirect to unversioned
canonical URLs. Original `/docs/...` SDK links and version-first URLs remain
valid through permanent redirects.

To release a new major, preserve the previous version folder, create the new one,
add it to that product's `versions`, and change its `latestVersion`. To add a
product such as UI or Cloud, add its registry entry and content under
`src/docs/<product>/<version>`.

Folder metadata groups SDK pages in the sidebar. Studio uses flat page URLs:
its version-level `metadata.json` declares sidebar sections, and each page's
`section` frontmatter assigns it to a group. Relative Markdown links can cross
product folders and are resolved to the target product's canonical URL.

## Checks

```bash
pnpm --filter kortyx-website type-check
pnpm --filter kortyx-website lint
```

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).
