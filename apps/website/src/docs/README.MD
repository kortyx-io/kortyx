# Docs Next Steps (Adoption + DX)

This file tracks the next improvements needed to make Kortyx docs dead-simple for onboarding and reliable for advanced users.

## Product Positioning To Reflect In Docs

- Kortyx is an opinionated framework for B2B/SaaS products that need granular, programmatic AI control.
- Docs should emphasize explicit workflows, predictable runtime behavior, and production reliability over “magic”.
- Docs should be TypeScript-first and server-runtime oriented.
- On every core path, show both:
  - fast first outcome (quick win)
  - clear progression to advanced control (streaming, persistence, provider strategy, failure handling)

## Documentation areas

- SDK (`/docs/sdk`): build applications, learn runtime concepts, and look up APIs.
- Studio (`/docs/studio`): inspect and debug runs, understand performance, manage prompts, and evaluate changes.
- Cloud (`/docs/cloud`): managed onboarding, workspaces, credentials, account/sign-in, and recovery.
- Self-hosting (`/docs/self-hosting`): local setup, deployment, security, operations, and configuration.
- CLI (`/docs/cli`): shared application/Studio commands and local container management, with explicit hosting and credential requirements.

Cloud and self-hosting link to the same Studio feature guides. CLI commands have one shared home. Cloud ingestion credentials support topology publication; Cloud CLI account login is not implemented, so do not advertise read, prompt-management, or connected-evaluation commands as accepting Cloud write keys.

Studio follows a first-run path before introducing task guides. Keep reference material available separately. The SDK retains its established getting-started, concepts, guides, production, reference, troubleshooting, and migration flow.

## Docs Structure Model (Layered)

Use this model for high-adoption docs:

1. Start in minutes (runnable quickstart + visible success state)
2. Core concepts (3-5 mental models)
3. Task guides (streaming, persistence, providers, interrupts)
4. Reference (complete API + schema + protocol details)
5. Troubleshooting + migration (errors, FAQs, upgrades)

## Common Adoption Failures To Avoid

- Too much concept and not enough runnable examples.
- No clear “path for my stack”.
- Production path is unclear after quickstart.
- API reference is incomplete or scattered.
- Errors are undocumented.
- Version compatibility/trust is unclear.

## Page Removal Policy (SEO)

When removing a docs page:

- move valuable content into remaining docs pages or skill guidance first
- add a same-area alias in `apps/website/src/lib/docs/config.ts` or a cross-area move in `apps/website/src/lib/docs/migrations.ts`
- map moved heading fragments in `docsAnchorMoves`; URL fragments never reach the server
- verify HTML and raw Markdown redirects, query preservation, canonical metadata, and sitemap exclusion for old URLs
- redirect to the closest replacement page/section (permanent)

## Priority 1: Onboarding outcomes

1. Finish replacing manual client reducer docs with the new `@kortyx/react` path wherever React is the audience.
2. Expand stack-specific quickstarts beyond Next.js (Express and Fastify paths).
3. Add explicit success states to all onboarding guides ("you should now see X").
4. Keep a 10–15 minute onboarding spine linking install → quickstart → guides → production.
5. Keep provider docs complete as provider packages ship under `providers/`.

## Priority 2: Reduce adoption friction

1. Expand **Troubleshooting** with top recurring setup/runtime errors and fixes.
2. Add compatibility notes for Node/framework/runtime expectations where ambiguity exists.
3. Add package-manager command parity checks on install/run pages.
4. Keep the provider selection guide current as provider packages gain new model types or provider options.
5. Keep the new runtime context, project structure, React + Node backend, and streamed rendering pages aligned with `skills/kortyx`.

## Priority 3: Support advanced users

1. Expand **Reference** depth for runtime hooks, stream protocol, provider contracts, and the `@kortyx/react` surface.
2. Add production guides: retries, observability, failure handling, and security checklist.
3. Expand migration guides for major-version upgrades and breaking changes.
4. Keep OpenTelemetry as the backend-neutral observability contract and maintain focused exporter recipes for supported backends such as Langfuse.
5. Keep the output-contract example in the Hooks guide and the realtime partial-chunk semantics in the Stream Protocol reference aligned with provider capabilities and `@kortyx/react` rendering.
6. Add a non-tool typed decision path for TypeSafe Jev before removing deprecated `useReason({ outputSchema, structured })` in the next major version; migrate the provider guide and examples with it.

## Skill Parity Coverage

Recent docs now cover the main `skills/kortyx` application guidance:

- node input/params/data flow: `sdk/v0/02-core-concepts/03-nodes.md`
- runtime request context: `sdk/v0/02-core-concepts/08-runtime-context.md`
- server/client folder boundaries: `sdk/v0/03-guides/01-project-structure.md`
- React frontend + Node backend architecture: `sdk/v0/03-guides/03-react-node-backend.md`
- streamed React rendering: `sdk/v0/03-guides/04-render-streamed-chat.md`
- `useReason({ emit: true })` vs `ui.message`: `sdk/v0/02-core-concepts/07-hooks.md`
- interrupt replay safety: `sdk/v0/03-guides/02-interrupts-and-resume.md`

## Suggested KPI targets

- Time-to-first-success ≤ 15 minutes.
- New-user quickstart completion rate ≥ 80%.
- Top recurring errors mapped to documented fixes ≥ 90%.

## Provider Docs Coverage

Current provider packages with dedicated website docs:

- provider selection guide
- `@kortyx/google`
- `@kortyx/openai`
- `@kortyx/anthropic`
- `@kortyx/deepseek`
- `@kortyx/groq`
- `@kortyx/mistral`

Remaining provider-doc improvements:

1. Add provider troubleshooting entries for missing env vars, unsupported model options, and JSON/schema behavior.
2. Link provider docs from installation and first workflow pages when provider setup is required.
3. Add non-text model docs if provider packages later expose embeddings, image generation, transcription, file APIs, or provider-hosted tools.

## Authoring Standard: TS + JS Code Tabs

When a guide includes TypeScript code, provide a JavaScript equivalent immediately after it.

### Preferred (automatic pairing)

Use two consecutive fenced blocks with `ts/tsx` then `js/jsx` and no paragraph between them:

````md
```ts title="src/lib/providers.ts"
import { createGoogleGenerativeAI } from "@kortyx/google";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY!,
});
```

```js title="src/lib/providers.js"
import { createGoogleGenerativeAI } from "@kortyx/google";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});
```
````

### Explicit grouping (when blocks cannot be adjacent)

Use the same `tabs=` (or `group=`) value on both blocks:

````md
```ts tabs="provider-init" title="src/lib/providers.ts"
// ...
```

```js tabs="provider-init" title="src/lib/providers.js"
// ...
```
````

## Authoring Standard: Package Manager Tabs

For install/run commands that vary by package manager, group command blocks with a shared `tabs` id and per-block `tab` label.

````md
```bash tabs="install-kortyx" tab="pnpm"
pnpm add kortyx
```

```bash tabs="install-kortyx" tab="npm"
npm install kortyx
```

```bash tabs="install-kortyx" tab="yarn"
yarn add kortyx
```

```bash tabs="install-kortyx" tab="bun"
bun add kortyx
```
````

## Studio navigation and copy

Navigation order for Studio, Cloud, self-hosting, and CLI is explicit in each `v0/metadata.json`: section purpose, order, and an exhaustive page list. An unlisted or unknown page fails navigation validation. SDK navigation remains compatible with its existing folder structure. Cloud has no version picker because its docs describe the current managed service; SDK, Studio, self-hosting, and CLI retain release compatibility context.

Write for a first-time user learning the basics and an experienced reader completing a task. Quickstarts need prerequisites, exact steps, an observable result, and a next step. Use the shared connection tutorial for Cloud and self-hosting; keep operator environment setup in self-hosting. Technical reference should explain exact behavior without interrupting tutorials.

Use the [Humanizer skill](https://github.com/blader/humanizer/blob/main/SKILL.md) for prose review: retain supported facts, remove staged introductions and filler, and use ordinary language. Preserve exact command/API names and link destinations while reviewing copy. Source moves and metadata changes follow the migration policy above.

Link related concepts where readers encounter them, using the current canonical
page or heading. Use `> **Good to know:**` for a short supplemental tip, caveat or
shortcut, with a relevant guide when one exists. Keep required setup and recovery
steps in the main instructions. Prefer a useful example or comparison over extra
decoration, and finish task guides with a concrete next step.

Contextual-help destinations remain in `apps/studio/src/lib/studio-help.ts`. Old installed Studio links remain supported. The migration regression inventory records the former 25 Studio pages and their indexed headings; all destinations must resolve to authored content. Shared help components, arrows, footers, and telemetry contracts are unchanged by the documentation restructure.

## Release and follow-up

1. Publish the website before releasing Studio links to newly authored content.
2. Review the Cloud and local first-run paths in the local production preview.
3. Verify the current version's CLI support before adding Cloud examples.
4. Keep recovery deadlines and feature availability aligned with the UI. Publish billing/team/SSO documentation when those capabilities ship.
5. Expand troubleshooting from observed setup failures. Measure quickstart completion and time to the first run without collecting application content or credentials.

The first-run target is 15 minutes, quickstart completion target is 80%, and the documented-fix target is 90% of recurring setup errors. These are targets, not measured outcomes. Every runnable TS example in the reorganized areas has a JS companion; existing SDK sample parity remains outside this restructure except for updated cross-area links.

See `docs/audits/documentation-restructure.md` for the content map, compatibility evidence, completion assessment, and remaining release checks.
