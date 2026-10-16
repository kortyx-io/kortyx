# Website search audit

Ahrefs crawl on 2026-10-16 at 20:58 Europe/Madrid completed with a health score
of 100, 134 URLs, 112 internal pages, and no internal URLs with errors. The
remaining actionable findings were shared metadata and navigation issues:

- 64 pages had schema.org validation failures: `primaryImageOfPage` requires an
  `ImageObject`; `codeRepository` and `programmingLanguage` belong to
  `SoftwareSourceCode`, linked from `SoftwareApplication.subjectOf`.
- 25 indexable pages had descriptions below 100 characters. Update the authored
  descriptions with page-specific information rather than padding or truncating.
- The Studio deployment section's generated description was 190 characters.
  Include fewer complete document titles to stay within 160 characters.
- About had a 14-character title; use a descriptive framework title.
- About, Contact, Security, and the docs landing page were missing required Open
  Graph fields. Next.js replaces nested metadata, so return a complete object.
- 70 pages linked through redirects, primarily the shared product breadcrumb.
  Link directly to each product's overview, and use the canonical React Client
  destination in Package Overview. Preserve legacy redirect compatibility.
- HTTP www took two hops through HTTPS www. Its production proxy configuration
  is owned by the private native infrastructure controller, not Next.js.

## Findings that need no indexing change

The 28 noindex entries are legal notices pending the existing publication-ready
flag, immutable legal archives, and machine-readable JSON copies. Preserve their
indexing policy and document bytes. Ten short descriptions on nonindexable legal
pages do not need search-result copy changes. Permanent aliases and HTTP-to-HTTPS
redirects remain useful; remove unnecessary internal links to them, not the
redirects themselves. Title/redirect changes are crawl-comparison notices.
IndexNow submission is an optional notification feature, not an indexing error.

## Verification and follow-up

`pnpm --filter kortyx-website test` checks authored docs descriptions and link
resolution. `test/e2e/search-visibility.spec.ts` checks complete rendered Open Graph
metadata, source/image schema shapes, direct breadcrumb destinations, the React
Client link, legacy redirects, title, search behavior, and bounded HTML payloads
on desktop and mobile. Keep legal and consent regressions in the full browser
suite. Schema references: [codeRepository](https://schema.org/codeRepository),
[primaryImageOfPage](https://schema.org/primaryImageOfPage).

Deploy through the normal release PR and staged same-digest website promotion.
After production is updated, run a fresh Ahrefs crawl; old crawl results remain
historical evidence and cannot confirm the new deployment. Keep the daily crawl
and operator-approved free quota behavior. A successful audit does not confirm
Google indexing; monitor Search Console separately.
