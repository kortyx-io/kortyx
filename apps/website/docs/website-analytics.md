# Website analytics operations

Website measurement answers which public pages consenting visitors read, which
known sources bring them, and whether page delivery performs well. It is separate
from SDK usage telemetry, customer execution traces, and Cloud account analytics.

## Runtime configuration

All variables are server-side runtime settings. Default is disabled. Only the
exact `kortyx.io` hostname can return configuration; local development, staging,
and PR previews return `null` even if accidentally given these variables.

| Variable | Value |
| --- | --- |
| `WEBSITE_ANALYTICS_ENABLED` | `true` only for the approved production rollout |
| `WEBSITE_POSTHOG_KEY` | Public `phc_` project ingestion key |
| `WEBSITE_GA4_ID` | Public GA4 `G-` measurement ID |
| `WEBSITE_CLOUDFLARE_ANALYTICS_TOKEN` | Public 32-character beacon token |
| `WEBSITE_ANALYTICS_LEGAL_VERSION` | Exact published website privacy/cookies version, initially `v1.1` |

Never use a PostHog personal API key, GA administrative credential, Cloudflare API
token or legal-service key as a browser identifier. `/api/website-analytics`
returns only these three public IDs and sitemap paths, with `private, no-store`.
It returns `null` for missing/invalid configuration, unavailable legal service,
unapproved notices or a different notice version. A newer notice therefore
requires explicit operator review and an updated version pin before collection
resumes. Existing loaded documents stop only on withdrawal/reload; disabling
configuration takes effect on the next full page load.

## Consent and collection

c15t 2.3 controls one optional `measurement` category. The new
`kortyx_privacy_v2` storage key does not import an earlier necessary-only
acknowledgment. Accept and reject are both banner actions. No vendor script or
PostHog bundle loads before opt-in; rejection persists. Withdrawal saves the
rejection, stops capture, clears GA cookies and Cloudflare’s active beacon
configuration, and reloads to remove vendor code and unload handlers.
Consent preferences expire after 180 days. No consent synchronizes to another
browser, SDK installation or Cloud account.

PostHog's `no-external` build sends only `$pageview`, once per pathname change.
The event reconstruction allowlists sitemap paths, fixed referral-source enums,
anonymous document-memory identity, event time and required SDK metadata.
Unknown paths are dropped; query strings, fragments, arbitrary referrers and
person-profile fields are excluded. Autocapture, page-leave, performance,
feature flags, replay, surveys, persistent identity and geolocation are disabled.
No customer content or website search text belongs in these events.

GA4 sends manual page views with canonical locations and path-based titles.
Enhanced measurement, Google signals, advertising personalization and granular
location/device collection are disabled in the property; code also denies all
advertising consent. Analytics cookies expire after 180 days without renewal on
activity. Its library can generate standard session/engagement measurements.
The analytics library's `googletagmanager.com/gtag/js` URL does not install a
Google Tag Manager container.

Cloudflare's native cookie-free beacon supplies page views and performance
metrics. **Use manual JS installation, with automatic injection disabled**;
otherwise Cloudflare could bypass the site's consent control. It has its own
native public URL/referrer dimensions; it does not use the PostHog event schema.
Cloudflare documents that query strings are not logged. Provider network
processing still receives IP/connection metadata; cookie-free is not a claim
that no personal information is processed.

PostHog reports document-level navigation, while GA cookies may connect consenting
visits and Cloudflare reports aggregate views/performance. These denominators
are different. Blockers, rejection, offline traffic, bot filtering and failed
requests create missing observations. No durable delivery/retry guarantee is
provided, and vendor failures must not stop access to content. Use `$pageview`
counts grouped by `page_path`/`source` for PostHog acquisition/navigation; do not
interpret document-memory distinct IDs as people or total website visitors.

## Provider settings and retention

Configured October 16, 2026:

- PostHog EU project **308814**, “Kortyx Website.” Autocapture off, replay off,
  discard client IP on. Existing organization billing remains unchanged. Its
  paid plan has seven-year event retention; do not describe it as 90 days.
- GA4 property **559337600**, web stream **16144349192**, “Kortyx Website,”
  Madrid timezone, EUR. User/event retention two months, reset on activity off;
  that setting does not govern all aggregated reports. Optional account sharing
  off; advertising personalization disallowed in all regions.
- Cloudflare site **48cd5eca2e2a4a2681a6fb06206a1e1c**, manual installation.
  Dashboard data available six months, unsampled seven days, longer periods
  aggregated/sampled; availability does not establish a physical deletion date.
- Ahrefs Free project **10544857**, “Kortyx,” DNS-verified. Daily audit at
  19:00–19:59 Europe/Madrid, 30 URLs/min, maximum 5,000 internal pages per crawl.
  The free monthly allowance can be exhausted; the operator chose complete
  crawls over an artificial 150-page cap. Keep the daily schedule and let free
  credits recover at reset. No paid upgrade, Ahrefs visitor beacon, always-on
  crawl, IndexNow integration or Search Console data-sharing grant is required.

Provider documentation: [PostHog retention](https://posthog.com/docs/api/events-retention),
[GA retention](https://support.google.com/analytics/answer/7667196),
[GA cookie settings](https://developers.google.com/analytics/devguides/collection/ga4/reference/config),
[Cloudflare collection](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/),
[Cloudflare FAQ](https://developers.cloudflare.com/web-analytics/faq/).

## Rollout and recovery

1. Review the exact `analytics-notices/*.v1.1.json` payloads and their SHA-256
   hashes over compact `JSON.stringify(payload)`. These are publication artifacts,
   not replacements for immutable v1 or the checked-in historical release index.
2. Publish only website privacy/cookies through the environment-specific native
   registry with an expected-current-version guard. Preserve v1 history. Verify
   the public manifest, current/versioned pages, hash and production approval.
   No Cloud Terms or acceptance policy activation is involved.
3. Merge after required final-head CI. Build the exact main commit in GitHub
   Actions and use Website / Production to stage and promote the same digest.
   Preserve staging/preview Cloudflare Access and origin protections.
4. Configure the production runtime variables above. Keep other environments
   disabled. Read configuration back and verify the hostname/legal-version gate.
5. In a fresh browser, verify no vendor requests before consent or after rejection;
   opt in, inspect canonical page views and all three destinations; navigate,
   withdraw, and verify the saved rejection and cleared GA cookies after reload.
   Verify provider receipt separately; loading a tag alone is not receipt.

To stop collection, set `WEBSITE_ANALYTICS_ENABLED=false`, redeploy/restart the
website, and verify the endpoint returns `null`. Existing browser documents need
a reload. Restore an earlier immutable website image if necessary, preserving
published legal history and all consent records. Never solve a failure by enabling
auto-injection, loosening the host gate, or sending legal/admin credentials to the
browser.

## Verification

```sh
pnpm --filter kortyx-website type-check
pnpm --filter kortyx-website lint
pnpm --filter kortyx-website test
pnpm --filter kortyx-website build
pnpm --filter kortyx-website exec playwright test
```

The analytics browser fixture intercepts every vendor request, exercises the real
PostHog encoder and consent revocation reload, and tests both desktop/mobile.
It does not send synthetic data to real projects or prove vendor-side receipt.
