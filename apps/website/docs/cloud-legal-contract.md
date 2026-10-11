# Cloud legal publication and private integration handoff

This public PR implements document hosting, archives, navigation and deterministic release metadata. It does **not** implement or activate Cloud acceptance. Every current document is a staging draft, not production-approved; the DPA is not executed. The supplied operator name is **Kortyx S.L.** Registration is not verified. No Cloud-owned source or infrastructure configuration is included here.

## URLs and release selection

Origin: `https://kortyx.io`. Preview: `https://pr-266.kortyx.dev` after its deployment passes; replace only the origin to review the same paths. These are proposed production URLs until the website PR is merged and deployed.

| Document / identifier | Convenient website draft URL | Permanent candidate URL |
| --- | --- | --- |
| Cloud Terms / `kortyx.cloud.terms` | `/cloud/terms` | `/cloud/terms/2026-10-11.staging.4` |
| Cloud Privacy / `kortyx.cloud.privacy` | `/cloud/privacy` | `/cloud/privacy/2026-10-11.staging.4` |
| DPA / `kortyx.cloud.dpa` | `/cloud/dpa` | `/cloud/dpa/2026-10-11.staging.4` |
| Subprocessors / `kortyx.cloud.subprocessors` | `/cloud/subprocessors` | `/cloud/subprocessors/2026-10-11.staging.4` |

Manifest: `https://kortyx.io/legal/cloud/manifest.json`. Exact hash-input JSON: `https://kortyx.io/legal/cloud/{slug}/{version}.json`. Human-readable version pages retain their own canonical URL; they never redirect to the convenient current URL. Unknown versions return 404, never current text.

The website's `currentWebsiteVersion` is a preview/navigation pointer, **not** the Cloud/c15t active policy. The already accepted staging Terms remain `2026-10-10.staging.3`. During the initial link migration, Cloud must use `https://kortyx.io/cloud/terms/2026-10-10.staging.3`, not `/cloud/terms`. Previous Terms and DPA versions `2026-10-08.staging.1`, `2026-10-08.staging.2`, and `2026-10-10.staging.3` are published exactly and independently.

The old Cloud Privacy/Subprocessors texts contain private infrastructure details. Their six release hashes and dates are recorded as `unavailableHistoricalReleases` in the manifest; their original content stays in the private Cloud archive. There is no public content or version page pretending to be those releases. Do not redact an old payload and reuse its version/hash. Publishing those exact historical texts requires resolving the public-disclosure constraint separately. Thus the website is ready to become the canonical home of the new public drafts and historical Terms/DPA, but a complete public archive of every old Cloud document is **not** complete.

Website notices remain separate: `/terms`, `/privacy`, `/legal`, `/cookies`, with exact old `2026-10-04.2-draft` and new `2026-10-11.3-draft` versions at `/{slug}/{version}`. Their pre-existing website hash format is separate from the Cloud acceptance hash. The supplied operator name and links were added in a new website draft; the old operator snapshot remains unchanged. Cookie settings continue to concern necessary browser preferences only.

## Cloud hash contract

`schemaVersion: 1`, `hashContract: kortyx-cloud-json-sha256-v1` names the **existing** Cloud representation; it does not introduce a new serialization algorithm. Each JSON payload contains exactly these insertion-ordered keys:

```text
slug, version, effectiveDate, draft, title, sections
```

Every section contains `title, text` in that order. Hash = lowercase hexadecimal SHA-256 of UTF-8 `JSON.stringify(document)` with those key orders. No indentation, BOM, newline, sorted-key canonicalizer, or Unicode normalization. The JSON route serves those exact compact bytes. Hash the response bytes directly, or parse and stringify without reconstructing/reordering the object. The hash does not include `hash` itself, the manifest wrapper, URLs, IDs, navigation, CSS, cookie preferences or HTML. Changes to the document title, date, draft flag, section title/text or ordering require a new release.

Stable IDs are manifest identifiers. `type` is the informational document category. `c15tType` for staging Terms is the existing `terms_and_conditions_staging_beta`; preserve the actual configured local/production type and tenant in the private backend rather than substituting the generic `terms_and_conditions` category. Privacy, DPA and subprocessor listing have `c15tType: null`; this PR creates no acceptance requirement for those notices and does not execute a DPA. `acceptanceRequired` describes the Terms' contractual role; the website has no acceptance endpoint or account identity.

All candidate documents have `draft: true`, `productionApproved: false`, `effectiveDateScope: staging-draft-only`, and `effectiveDate: 2026-10-11T00:00:00.000Z`. This is the proposed staging release date, not production legal effectiveness or c15t activation. Historical dates are retained exactly. A finalized production date or any reviewed wording must be published under another new version rather than changing these frozen drafts.

| Terms version | Effective date (staging draft) | SHA-256 |
| --- | --- | --- |
| `2026-10-08.staging.1` | `2026-10-08T00:00:00.000Z` | `68e811c6e077fdc9b88d7800fee689232c02de702d0ac272fb50ce06ceb7ff2f` |
| `2026-10-08.staging.2` | `2026-10-08T00:00:00.000Z` | `28c49c165e90d89fe212589c3fb2f07ab0ce212a2e2fd68766b94f9a191634c8` |
| `2026-10-10.staging.3` | `2026-10-10T00:00:00.000Z` | `68a63d9d15c2a7b90a057f1b4dc4580f6f04d5cd94af179feb4e13c9a5139ce8` |
| `2026-10-11.staging.4` | `2026-10-11T00:00:00.000Z` | `ec0ee5c5f573710842b6419f996e5dbb929d0435da369a23e9d018ff821d9389` |

| Other candidate document | SHA-256 (`2026-10-11.staging.4`) |
| --- | --- |
| Privacy | `c311d39ab4814f46be8e45edda0d74589cb3995e70bbafca51387ed32275a4dc` |
| DPA | `38b81c2264ba8b034d44d13f5d3e7049b5319993532673bc9a35e55d6421fc47` |
| Subprocessors | `41ac43b6be94dbe87a43c92ae610fdd3ed66d6df8b79d0b98c5afedbfafc782b` |

The complete pins, including website drafts and DPA histories, are in `src/legal/release-hashes.json`. Existing Cloud release hashes were compared to the reference document outputs during preparation. Pins and frozen payloads are reviewed release artifacts, not fixtures to regenerate automatically to make a failing test pass.

## Terms changes and publicity

The new Terms retain organization-authorized name/logo publicity, revocable permission, brand guidelines, no implied endorsement, separate written approval for testimonials/case studies, no marketing-email consent, and the existing 10-business-day removal commitment. They remove the unavailable Organization Settings promise. Publicity correspondence uses the existing public GitHub Discussions channel, verified enabled for the repository; only an organization's public name/listing URL should be posted there, never personal or confidential information. This is not a private legal/privacy request channel.

The old Terms' Organization Settings text remains visible at its permanent URL as part of the exact accepted record. The new Terms also simplify the staging deletion mechanism wording without changing its recovery window or purge behavior. No settings UI is restored, no marketing permission is inferred from optional survey answers, and no existing acceptance evidence is rewritten.

## Private-Cloud follow-up — not performed by this PR

1. Preserve every existing legal payload, version and hash in the private archive, including historical notices unavailable publicly. Compare the website's old Terms/DPA JSON byte hashes with the private archive and stored c15t records before linking them. Do not derive historical payloads from future mutable common section arrays.
2. Add a reviewed manifest/content resolver in the private legal-document layer (`ee-packages/cloud-security/src/legal-documents.ts`). Pin the exact allowed origin, IDs, versions, hashes, dates and configured c15t type/tenant server-side. Fetch bounded JSON with timeouts and no unexpected redirects, recompute the existing hash and reject mismatches/unknown versions. Keep an immutable local archive/cache; a website update or outage must never silently switch the active acceptance requirement. Server-side policy/archive mismatch must continue to fail closed.
3. Replace the inline Terms document in private Cloud onboarding with a clear link to the backend-resolved **version URL**, using `target="_blank" rel="noopener noreferrer"`. Link the corresponding reviewed Cloud privacy/DPA/subprocessor release versions separately; do not claim the new public Privacy matches the old private Privacy hash. Keep the Terms checkbox/explicit submission in the authenticated Cloud flow. Keep server-authoritative identity/time and version binding. Do not restore `/auth/legal/...` routes. Update private legal client/document helpers and onboarding components, not public Studio functionality.
4. Preserve the existing self-hosted c15t snapshot/signing and append-only evidence flow. The private server must resolve and validate the same version/hash/date used for the website link before signing or accepting. Keep signing keys server-side. Verify the actual installed c15t backend contract; its [snapshot integration guide](https://c15t.com/docs/self-host/guides/legal-document-snapshot-integration) describes signed release metadata and append-only evidence. Do not introduce a browser signer or change configured types/tenants as part of this document migration.
5. Keep the Cloud BFF and direct human API acceptance enforcement authoritative. Navigating, opening a tab, seeing the text, clicking a link, acknowledging website storage, or submitting/skipping optional onboarding answers records **no** acceptance. Client-supplied URLs/versions/hashes cannot replace the authoritative release selection. Continue to reject stale/mismatched/expired evidence and preserve account/session/deletion controls when Terms are declined. Do not couple marketing choices to access.
6. After website deployment and separate legal/operator authorization, publish/register an explicitly selected new Terms policy in c15t and coordinate the private archive/configuration switch. The candidate `.4` in this PR has **not** been activated. Register it only if approved for staging; production must use separately finalized documents. Confirm the deployed version page and JSON/hash before activation. Coordinate rollout so server enforcement and onboarding links refer to the same policy. A new active Terms version requires explicit fresh acceptance under existing rules; never backfill consent for real users or rewrite old records. If rollback is required, use an explicitly coordinated backend policy/configuration procedure, never alter the archived document.
7. Add private tests for version-specific new-tab links, signed snapshot binding, stale/tampered/expired release rejection, BFF/direct-API enforcement, unchanged old evidence, declining Terms/account controls, survey independence, and absence of acceptance writes from viewing or website preferences. Check publicly deployed links before removing the inline renderer.

Historical verification uses the evidence's authenticated subject, action/time, configured type/tenant, exact version and content hash to retrieve the immutable payload and recompute its hash. Current website pointers play no part. Maintain private historical archives for releases whose original contents cannot be published, and retain evidence according to a reviewed schedule. Never imply that deleting a workspace erases the contractual record.

## Facts and approvals still required

- Verified Kortyx S.L. business/contact address, applicable registration and tax identifiers; user-supplied name is not registry verification.
- A working **private** legal/privacy mailbox or equivalent verified request channel. Public GitHub is not suitable for personal-data requests; the vulnerability channel is for security reports only.
- Actual website and Cloud service-provider legal entities, roles, data categories, processing locations, contracts, subprocessor authorization/change process and any international-transfer mechanisms/assessments.
- Approved purposes/legal bases and legitimate-interest assessments, retention/deletion/backup schedules (including telemetry, accounts, optional answers, security records and acceptance evidence), rights-request procedures and relevant authority details.
- Completed DPA processing/security annexes, confidentiality, assistance, incident handling, return/deletion and audit procedures matched to operational evidence; execution and legal review.
- Legal review of service scope, operator eligibility, beta/publicity terms, removal-request handling, liability and governing law; production effectiveness and publication approval. No certifications, SLAs or production approval are asserted.

The DPA draft's topics are guided by [GDPR Article 28](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng); identifying the topics is not completing a binding agreement or providing a compliance certification.

## Verification

Run website-only unit/type/build and desktop/mobile production browser checks. Tests pin old/new hashes, compare JSON response bytes with hashes, compare rendered section text with exact payloads, check permanent/current/unknown URLs, draft metadata, overflow, navigation and original website operator snapshots. `coverage` participates in repository CI without running the full Studio suite locally. Screenshots and final CI status are recorded in PR #266's handoff.
