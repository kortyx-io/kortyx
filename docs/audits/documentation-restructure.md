# Documentation structure and migration

Date: 2026-10-18. Scope: public website documentation, navigation, search, SEO,
legacy URL/heading compatibility, shared CLI guidance, and portable Kortyx skill
links. Existing OSS/Cloud help components and runtime APIs remain unchanged.

## Reader paths and acceptance

The first-time reader follows Cloud or local setup, connects an application,
opens one real run, follows its steps, then investigates a problem or evaluates a
change. Returning readers enter a task guide or reference directly. Operators use
self-hosting; Cloud account/workspace administration has a separate entry.

Five areas: SDK, Studio, Cloud, self-hosting, and shared CLI. Studio has six task
sections with explicit ordering. Cloud, self-hosting, and CLI each have their own
curated sections and page lists. The shared connection and feature guides have one
canonical home. Cloud describes the current managed service and has no version
picker; release-based areas retain their version controls.

Acceptance: all original Studio pages and indexed headings still resolve; both
HTML and Markdown support permanent redirects; ordinary moved URLs preserve query
strings; canonical/social/structured metadata and sitemap include the new homes;
search can discover shared features from Cloud; desktop/mobile navigation works;
no private CI, publication, or deployment is needed for local review.

## Original gaps and content map

| Original material | Treatment and current home |
| --- | --- |
| Studio overview mixed onboarding with deep child-workflow/evaluation details | Short orientation at `/docs/studio/overview`, followed by concepts and the first-run walkthrough; deeper tasks linked |
| Connection guide introduced secondary integrations before the first run | Shared minimal connection path; feedback at `/docs/studio/feedback`, topology at `/docs/cli/topology`, interruption guidance under Studio interrupts |
| Evals mixed interface, SDK wiring, backend configuration, contracts and automation | Shared first-eval/judging/results guides; execution/settings reference; self-hosted configuration/worker operations; CLI automation |
| Cloud pages appeared late in the Studio index | Dedicated `/docs/cloud` entry, onboarding, workspace/recovery, connections, account/sign-in and troubleshooting |
| Local Docker instructions and remote CLI operations shared one self-hosted page | Shared `/docs/cli` with installation, connections, topology, local evals, inspection, prompts, remote evals, automation, local containers and reference |
| CLI examples implied a Cloud project key could authorize all Studio operations | Explicit command availability: Cloud ingestion/topology supported; Cloud CLI account login absent; Studio reads/management need supported credentials |
| Broad Using Studio list had no progression | Get started, inspect/debug, performance, prompts, evaluations, reference/troubleshooting |
| Generated snippets and missing JS alternatives | Specific search descriptions, Humanizer prose review, and paired runnable TS/JS examples throughout reorganized areas |

## Compatibility and SEO

`src/lib/docs/migrations.ts` records cross-area moves and 41 moved heading
fragments. The golden migration fixture records 25 former Studio pages and their
189 indexed heading destinations. Existing shared feature slugs stay stable.
Source-numbered paths and older major-version URL forms remain supported by the
router. Current canonical links omit the current major; explicit older major
resolution remains independent across documentation areas.

Known moved HTML/Markdown URLs receive 308 responses before page rendering.
The raw-Markdown handler also resolves normalized legacy paths and preserves
queries. The server never receives a URL fragment; a small client component
forwards old section bookmarks to their new guide while preserving the query.
Old fragment IDs remain in the source page HTML. No telemetry or sensitive data
is sent by this component.

Each authored page has a unique description of 100 to 160 characters, one article
H1, title, canonical URL, Open Graph/Twitter metadata, and breadcrumb/article
structured data. The docs home has CollectionPage/ItemList data. The sitemap
contains canonical destinations and excludes legacy redirect entries. Raw Markdown
and generated social images use the same route resolver. Internal cross-area
links target their new homes; existing SDK relative links preserve major-version
behavior.

## Copy and example review

Used [Humanizer 3.1.0](https://github.com/blader/humanizer/blob/main/SKILL.md), read
from upstream for this task, in embedded editing mode. New prose leads with the
task, uses supported product facts, avoids staged introductions and decorative
claims, and leaves exact API names/commands intact. Original contracts were moved
to their owning reference or operational page; an obsolete evaluation availability
disclaimer was corrected against the current prompt interface.

Studio has 9 TS and 9 JS examples, self-hosting 7 and 7, CLI 1 and 1. Cloud's guides
are prose/command-based. JavaScript examples use local ESM import extensions.
Existing SDK snippets are unchanged except for links to moved documentation;
the broader SDK sample-parity backlog is not part of this restructure.

## Completion assessment

| Policy area | Assessment |
| --- | --- |
| Behavior and contracts | Complete: documentation routing/navigation/search verified in 136 unit/content tests and 42 browser checks. SDK, CLI, API and saved-data contracts unchanged. |
| Studio integration | Complete: all 58 existing help destinations and rendered anchors resolve, including old Cloud links; seven OSS help browser regressions pass against the new website. No tooltip/card/arrow implementation change in this restructure. |
| Documentation and examples | Complete: 53 reorganized pages, guided paths, source/heading migration maps, 17 paired TS/JS examples, README and release guidance. Link, metadata, navigation and content tests pass. |
| Kortyx skill | Complete: canonical Cloud/account/CLI entry points and credential/availability boundaries updated in `skills/kortyx/references/studio-local-development.md`; referenced documentation destinations pass link checks. |
| Usage telemetry | Not applicable to instrumentation: existing consent-aware page views and Studio help events unchanged. No new tracking or collection. Navigation adoption targets below remain unmeasured. |
| Customer observability | Not applicable: no execution emission, storage, projection, or diagnostic changes. |
| Compatibility/extension points | Complete: generic area configuration and move maps; no private source dependency. All 500 original generated routes resolve successfully; aliases, independent major-version behavior, Markdown routing and 189 historical heading destinations covered by tests. |
| Security/privacy | Complete: public documentation only; Cloud customer guidance contains no private infrastructure configuration. Redirect targets are authored same-origin paths; malformed and prototype-name fragments do not cause browser errors. Existing consent/privacy browser regressions pass. |
| Verification | Complete for this scope: production build, type check, content/unit tests, browser/visual checks and HTTP compatibility checks pass; commands and limits below. |
| Release/operations | Complete preparation: publish website first, then affected OSS release, then sync and release Cloud. Local website refreshed for review. No package/runtime release, live deployment, commit, push, PR or CI performed. Publishing remains a separate release action. |

## Verification

- `pnpm --filter kortyx-website test`: 136 tests pass across 11 files,
  including authored links/headings, legacy routes, explicit navigation, metadata,
  historical headings, independent version resolution, and TS/JS example parity.
- `pnpm --filter kortyx-website type-check`: passes.
- `pnpm --filter kortyx-website build`: production build passes.
- Changed website TypeScript/JSON Biome checks: 28 files pass; the final selector
  and browser-test edits also pass a focused check. `git diff --check` passes.
- From `apps/website`, `pnpm exec playwright test
  documentation-structure.spec.ts search-visibility.spec.ts credibility.spec.ts`:
  42 checks pass against the production build in desktop and mobile Chromium.
  Covers five entry points, area switching, mobile menus, global/scoped search,
  HTML/Markdown redirects, fragment/query forwarding, SEO/social/JSON-LD/sitemap,
  responsive layout and existing privacy/navigation behavior.
- From `apps/studio`, `pnpm exec dotenv -e ../../.env.example -- playwright test
  contextual-help.spec.ts`: seven checks pass using OSS `6311`, API `6411`,
  consumer `6511` and `KORTYX_HELP_WEBSITE_URL=http://localhost:6211`.
  Synthetic review data was restored afterward.
- Live local HTTP comparison with the pre-change route inventory: 500 of 500
  routes resolve, including 435 redirects. All 58 help destinations return 200
  after redirects and contain their linked rendered heading IDs.
- Local production website: `http://localhost:6211/docs`. Desktop/mobile
  screenshots for the index, Studio, Cloud, self-hosting and CLI are saved in
  the task's `screenshots/documentation-structure` artifact directory and visually
  reviewed. Introductory navigation uses link-first lists to avoid off-screen
  table links on phones.

Expected existing warnings: the negative-resource browser checks emit Next
`NoFallbackError` logs while returning the required 404 responses; the local start
command reports the existing standalone-output advisory. Neither prevented the
checks above from passing.

No CI was triggered. Required CI for a future PR remains unrun. This restructure
does not rebuild private Cloud or change its runtime. Cloud production builds,
live provider/evaluation execution, AWS deployment, external OAuth, hardware
passkeys, and other browser engines were not exercised. Example parity checks
verify documentation structure; they do not claim execution of every sample.

Review refinement: removed the extra "New to Studio?" section from the docs
landing page. Its five area cards provide the entry points; the first-run guide
remains in Studio navigation. The subsequent production build and focused Biome
check pass. Desktop/mobile browser checks confirm the extra section is absent
and all five area links remain visible; local preview and index screenshots were
refreshed. Routing, metadata, telemetry, examples and release scope are unchanged.

Cloud navigation refinement: service documentation now supplies no version-picker
options, and the shared desktop/mobile sidebar omits that control. Release-based
areas retain their picker. The production build (including type checking), focused
Biome checks and desktop/mobile browser verification pass: Cloud has one area
picker and no version control, while SDK retains both. Cloud screenshots and the
local website were refreshed; no CI was triggered.

## Final docs and help-link audit

Release preparation reviewed all 53 reorganized Studio, Cloud, CLI and
self-hosting pages. Updated 47 pages, keeping their frontmatter, headings and
code examples unchanged. The existing checks also validate internal links and
heading targets across SDK documentation.

### Gaps corrected

- Internal links increased from 241 to 332 authored occurrences in the
  reorganized pages. Added contextual links where a reader encounters a concept,
  links inside supplemental callouts, and next steps on references that had none.
  Eight existing authored links now target the canonical home directly.
- Good to know callouts increased from five to 50. All use the exact
  `> **Good to know:**` label and the existing styled Markdown renderer. Tips
  cover missing capture, overlapping timing, prompt promotion, credential roles,
  evaluation outcomes, recovery and deployment boundaries. Required setup and
  recovery steps stay in the main instructions.
- Corrected the table-help description: header titles own help; explained symbols
  do not need an extra question mark. Removed a stale reference to server setup
  instructions from the shared evaluation-results guide and consolidated duplicate
  next-step paragraphs on the Cloud account page.
- Corrected a topology guide link that would otherwise return the reader to its
  own moved section. Kept older URLs and headings available to installed builds.
- Retained examples, comparison tables and short task sections; no decorative UI
  or new Markdown component API was added. Humanizer review retained the original
  supported facts and exact commands.

### Help inventory and compatibility

The OSS registry and latest Cloud checkout's shared registry are byte-identical:
58 destinations, including 19 Cloud topics. Source inspection found no undefined
help topics in either OSS or Cloud-specific screens (35 and 18 directly referenced
topics respectively; column helpers also reuse the registry). Cloud settings,
account, sign-in, recovery, onboarding and connection help use those definitions.

All 58 destinations were opened in a fresh browser context against the local
production website. Each reached an authored page, and each fragment reached its
actual heading after server redirects and any client fragment forwarding. All 19
Cloud topics passed. This verifies Cloud's documentation destinations; it does not
claim another native Cloud authentication or account-mutation test run.

The historical inventory still resolves all 500 routes, including 435 redirects.
The golden fixture continues to cover the former 25 Studio pages and 189 indexed
headings. No headings, metadata, code samples, runtime APIs, help definitions,
telemetry, permissions or release contracts changed in this content pass.

### Final validation

- `pnpm --filter kortyx-website test`: 136 tests pass across 11 files, including
  all-area authored links, real heading targets, migration bookmarks, help links,
  navigation, SEO content and TS/JS parity.
- `pnpm --filter kortyx-website build`: production build and its TypeScript check
  pass. The local production preview at `http://localhost:6211/docs` was restarted
  with this build.
- Website Playwright: `documentation-structure.spec.ts`,
  `search-visibility.spec.ts` and `credibility.spec.ts` exercised all 42 desktop
  and mobile scenarios. The first run passed 41; the desktop historical-route
  scenario timed out while several audits ran concurrently. Rerunning that exact
  scenario alone with the original timeout passed in six seconds. No assertions
  or timeout limits were changed.
- OSS `contextual-help.spec.ts`: all seven setup, hover/keyboard, drawer, symbol,
  touch, light-theme and cleanup checks pass against the new website. Synthetic
  OSS preview data was restored afterward.
- Additional browser audit: 58 of 58 help destinations pass, including all 19
  Cloud topics. Styled callouts and linked guides were checked on desktop/dark
  and mobile/light layouts for Studio, Cloud, CLI and self-hosting, with no page
  overflow. Screenshots were inspected.
- Content comparison confirms zero code-sample, frontmatter or heading changes.
  `git diff --check` passes. The task artifacts include `tooltip-link-audit.json`,
  `content-link-audit.json`, `compatibility.json` and eight callout screenshots.

No documentation-link blocker remains in the verified scope. Publish the website
before releasing the OSS help changes, then integrate and release Cloud. This
audit does not publish or release anything. No CI, commits, pushes or PRs were
triggered; future PR CI and the previously listed live-service checks remain
outside this local documentation verification.

## Adoption measures and next maintenance

Targets: first visible run within 15 minutes, 80% quickstart completion, and fixes
for 90% of recurring setup errors. These are goals for product review, not measured
outcomes or new analytics claims. Review consent-aware aggregate page paths and
existing help opens/documentation clicks without capturing application content.

Next: publish the website before Studio, keep current Cloud feature availability
and recovery deadlines aligned with releases, add team/billing/security guides
when their features ship, and expand troubleshooting from recurring support
issues. Validate new pages through the same navigation, link, SEO and example
checks. Do not add empty future-feature sections to the public sidebar.
