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

## Cloud legal documents

See [the publication and private-Cloud integration contract](./docs/cloud-legal-contract.md) for exact URLs, release hashes, activation boundaries, immutable history and outstanding operator/legal facts. Website publication does not activate Cloud acceptance.

Production document text comes from the environment-specific legal publication registry. Local development without feed configuration uses immutable repository archives. Website navigation does not record Cloud acceptance.

## Website analytics

See [configuration, consent, provider settings and rollout](./docs/website-analytics.md).
Optional measurement is disabled by default and waits for fresh browser consent
and the exact approved privacy/cookies publication version.

## Checks

```bash
pnpm --filter kortyx-website type-check
pnpm --filter kortyx-website lint
```

## Search and canonical URLs

The homepage title identifies Kortyx as a TypeScript framework for AI agents.
Requests whose host is `www.kortyx.io` permanently redirect to `https://kortyx.io`,
preserving the path and query string. Local development and preview hosts are
unaffected. The redirect takes effect with the next website deployment.

Historical docs links using numbered folders/files, old display-label suffixes,
or the removed models page permanently redirect to the matching current page.
Known pre-`/docs` Markdown URLs are listed explicitly in `next.config.ts`;
product-specific renamed slugs remain in `src/lib/docs/config.ts`.
Markdown links keep their Markdown representation, and archived version links
stay within their requested version. Unknown pages, sample API endpoints,
source-code imports, and expired assets still return 404.

`test/fixtures/legacy-docs-urls.json` records the 120 distinct paths from the
October 16 Search Console audit: 74 documentation redirects and 46 non-document
paths that should remain missing. The regression suite checks the redirect
status, final destination, representation, and retained 404 behavior.

Documentation search loads `/api/docs-search` only when its dialog opens. The
public index is generated with the website build, kept out of page HTML and RSC
payloads, and reused across dialog openings and navigation within a browser tab.
Search queries stay in the browser. Loading failures show a retry button;
product/version filtering and section links use the same index as before.

Run the focused production browser checks after building:

```bash
pnpm --filter kortyx-website exec playwright test test/e2e/search-visibility.spec.ts
```

## License

Apache-2.0. See [LICENSE](https://github.com/kortyx-io/kortyx/blob/main/LICENSE).


### Legal publication feed

Legal pages can read the environment-specific publication registry at request time. Configure server-only `WEBSITE_LEGAL_ENVIRONMENT`, `WEBSITE_LEGAL_SERVICE_URL` and `WEBSITE_LEGAL_SERVICE_KEY`; staging and PR previews use staging, production uses production. With no settings, local development uses checked-in archives. Configured feeds fail closed on outage, wrong environment or integrity failure. See [the document contract](docs/cloud-legal-contract.md) for exact URLs, formats, hashes, migration order and Cloud integration boundaries. Website navigation never records acceptance.
