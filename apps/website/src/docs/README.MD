# Docs Next Steps (Adoption + DX)

This file tracks the next improvements needed to make Kortyx docs dead-simple for onboarding and reliable for advanced users.

## Product Positioning To Reflect In Docs

- Kortyx is an opinionated framework for B2B/SaaS products that need granular, programmatic AI control.
- Docs should emphasize explicit workflows, predictable runtime behavior, and production reliability over “magic”.
- Docs should be TypeScript-first and server-runtime oriented.
- On every core path, show both:
  - fast first outcome (quick win)
  - clear progression to advanced control (streaming, persistence, provider strategy, failure handling)

## Approved Top-Level Flow

1. Start Here
2. Getting Started
3. Core Concepts
4. Guides
5. Production
6. Reference
7. Troubleshooting
8. Migration & Versions

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
- add an old-slug -> new-slug redirect in `apps/website/src/lib/docs/config.ts`
- redirect to the closest replacement page/section (permanent)

## Priority 1 — Onboarding outcomes

1. Finish replacing manual client reducer docs with the new `@kortyx/react` path wherever React is the audience.
2. Expand stack-specific quickstarts beyond Next.js (Express and Fastify paths).
3. Add explicit success states to all onboarding guides ("you should now see X").
4. Keep a 10–15 minute onboarding spine linking install → quickstart → guides → production.

## Priority 2 — Reduce adoption friction

1. Expand the new `@kortyx/react` page with storage override, interrupt, and debug examples as usage settles.
2. Expand **Troubleshooting** with top recurring setup/runtime errors and fixes.
3. Add compatibility notes for Node/framework/runtime expectations where ambiguity exists.
4. Add package-manager command parity checks on install/run pages.

## Priority 3 — Support advanced users

1. Expand **Reference** depth for runtime hooks, stream protocol, provider contracts, and the `@kortyx/react` surface.
2. Add production guides: retries, observability, failure handling, and security checklist.
3. Expand migration guides for major-version upgrades and breaking changes.

## Suggested KPI targets

- Time-to-first-success ≤ 15 minutes.
- New-user quickstart completion rate ≥ 80%.
- Top recurring errors mapped to documented fixes ≥ 90%.

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
