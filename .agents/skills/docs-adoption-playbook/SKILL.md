---
name: docs-adoption-playbook
description: Use when auditing or improving Kortyx/framework documentation for developer adoption. Produces a dead-simple onboarding path for beginners plus deep-dive structure for advanced users, with concrete next-step edits.
---

# Docs Adoption Playbook

## Purpose

Turn broad documentation feedback into a concrete, shippable docs plan that improves adoption and time-to-first-success.

## Product Messaging Lens

When writing or restructuring docs, keep this positioning explicit:

- Kortyx is an opinionated framework for B2B/SaaS apps that need granular, programmatic AI control.
- Prioritize explicitness and reliability over “magic” abstractions.
- Show the progression from quickstart outcome to production-grade control (streaming, persistence, provider strategy, failure handling).
- Keep docs TypeScript-first and Node/server-runtime oriented for system builders.

## When to use

Use this skill when the request asks for any of the following:

- improve onboarding docs
- compare current docs against successful framework patterns
- reduce DX friction / adoption risk
- collect common docs complaints and convert them into fixes

## Required inputs

- docs root path (for this repo: `apps/website/src/docs`)
- target audience split (beginner, advanced)
- primary framework path(s) to optimize first (Fastify, Express, Next.js, etc.)

Do not assume Next.js is the default path. If one input is missing, infer from repo and state assumptions.

## Adaptive Page Composition Rule

Do not force the same section template on every page. Choose sections based on page intent.

- For onboarding/task guides, ensure:
  - prerequisites (only what is needed)
  - runnable example
  - expected result / success signal
  - explicit next step links
- For deep reference pages, prioritize precision and completeness over tutorial flow.
- Keep pages concise and outcome-oriented; avoid filler sections.

## Default Sidebar Flow

Use this as the default top-level docs IA:

1. Start Here
2. Getting Started
3. Core Concepts
4. Guides
5. Production
6. Reference
7. Troubleshooting
8. Migration & Versions

## Workflow

1. **Audit current docs IA**
   - List sections/pages and identify missing layers:
     - Quickstart
     - Concepts
     - Task guides
     - Reference
     - Troubleshooting
     - Migration
2. **Define onboarding spine (10–15 min path)**
   - First successful outcome
   - 3–5 follow-up tasks in sequence
   - “what to read next” links per step
3. **Capture adoption blockers**
   - Map common complaints to actionable fixes:
     - no runnable examples → add copy/paste recipe
     - no clear stack path → add "Choose your stack" entry points
     - unclear production path → add production checklist
     - incomplete/scattered API docs → add centralized API map + per-package reference links
     - weak error docs → add error catalog with fixes
     - docs/version mismatch risk → add major-version compatibility notes where needed
4. **Design dual-track docs**
   - Beginner track: outcome-first, minimal concepts
   - Advanced track: architecture + complete API details
5. **Ship concrete artifacts**
   - Add/update at least one docs page
   - Add/update a docs `README.MD` with prioritized next steps

## Code Sample Parity Rule (TS + JS)

When editing docs under `apps/website/src/docs`, every TypeScript snippet should include a JavaScript equivalent.

- Prefer tabbed TS/JS snippets using two consecutive code fences (no paragraph between):
  - ` ```ts ... `
  - ` ```js ... `
- If snippets cannot be adjacent, use matching group metadata:
  - `tabs="some-id"` (or `group="some-id"`) on both TS and JS fences
- Keep examples behaviorally equivalent:
  - remove TS-only syntax/types in JS
  - keep imports/API usage aligned
  - do not use placeholders like “same as TS”

## Command Variant Rule (Package Managers)

For install/run commands, prefer explicit package manager variants over a single generic `bash` example when commands differ.

- Include `pnpm` + `npm` variants at minimum.
- Add `yarn`/`bun` when relevant and accurate.
- Keep one recommended variant first, then alternatives.
- Use tabbed command snippets with shared `tabs="id"` + per-block `tab="pnpm|npm|yarn|bun"` labels.

## Deep Knowledge Callout Rule (`Good to know`)

When a page has important but non-blocking details (caveats, edge cases, performance behavior, version gotchas), add a short callout.

- Use this exact markdown pattern:
  - `> **Good to know:** <detail sentence>. <optional link sentence>.`
- Keep callouts concise (1–3 sentences).
- Place callouts directly under the step/section they clarify.
- Do not hide required setup steps inside callouts; callouts are supplemental.
- Limit to high-value details only (avoid overusing on every section).
- Keep wording positive and developer-guiding; avoid alarmist phrasing.

## Versioning Rule For Docs

- Within the same major version, update docs in place.
- When introducing a new major docs line, add migration guidance and explicit version pathing.

## Page Removal + SEO Rule

Before deleting a docs page:

- migrate any still-useful content into remaining docs/skill guidance
- add a legacy redirect entry in `apps/website/src/lib/docs/config.ts` (`legacyRedirects`)
- ensure the old URL permanently redirects to the best replacement page/section
- check for broken internal links after deletion

## Copy-Ready LLM Prompt (Per Page)

Use this prompt when you want an LLM to improve one docs page quickly and consistently:

```text
You are editing one Kortyx docs page.

Target file:
- <relative-path-to-md-file>

Goals:
1) Improve clarity and time-to-first-success for a new user.
2) Keep advanced technical accuracy.
3) Add high-value "Good to know" callouts for deep details where needed.
4) Ensure TS snippets have JS equivalents (tab-friendly pairing).
5) Reflect professional/server-heavy usage (Fastify/Express/Next.js paths where relevant).

Hard constraints:
- Keep markdown format (no MDX-only components like <Steps>).
- Preserve frontmatter keys unless values are clearly wrong.
- Keep API behavior accurate with current Kortyx architecture.
- Do not assume Next.js as default; include Fastify/Express paths where the page scope calls for it.
- Use this callout syntax exactly:
  > **Good to know:** ...
- For TS/JS code parity:
  - Prefer adjacent fenced blocks: ```ts then ```js
  - If non-adjacent, use matching tabs="id" (or group="id") on both blocks.
- For CLI commands:
  - Provide pnpm + npm variants at minimum when command syntax differs.

Deliverables:
- Updated markdown content (ready to paste).
- Short changelog (bullets) describing what changed and why.
- A checklist of remaining gaps (if any).
```

## Output format

Always produce:

1. **Current gaps** (bullets)
2. **Proposed structure** (ordered sections)
3. **Immediate next 3–7 edits** (repo-specific)
4. **Success metrics**
   - time-to-first-success
   - quickstart completion rate
   - % errors with documented fixes
5. **TS/JS coverage**
   - which pages now include TS+JS tabbed snippets
   - any remaining TS-only snippets to convert next

## Quality bar

A docs update is successful only if:

- a new user can run one complete example without guessing hidden steps
- runnable examples include an expected outcome (what users should see)
- advanced users can find precise API/protocol details in under 2 clicks
- every major guide ends with explicit next pages
