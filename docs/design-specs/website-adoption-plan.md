# Kortyx website adoption plan

Status: proposed  
Prepared: August 31, 2026

## Executive decision

Kortyx does not need a larger documentation homepage. It needs a product website in front of the documentation.

The strongest initial position is:

> **Build the agent logic. Kortyx handles the runtime.**
>
> Kortyx is a TypeScript framework built on LangGraph that packages the abstractions production-oriented agents repeatedly need: workflows, typed model calls, frontend streaming, human input, persistent runtime state, session branching, and observability.

This gives Kortyx a narrower and more credible wedge than “everything you need to build AI agents.” It is for TypeScript teams that want to focus on agent business logic instead of rebuilding the backend and frontend plumbing around every agent. The framework's origin story is the proof of the problem: Kortyx packages abstractions its creator kept needing across agent projects.

The public product model must be explicit everywhere:

1. **Kortyx Framework** — Apache-2.0 open source; runs inside the user's application and infrastructure.
2. **Kortyx Studio** — optional, self-hostable, source-available observability; currently a preview under ELv2.
3. **Kortyx Cloud** — a future managed product; not available yet and not required to use the framework.

The website should make a visitor understand that model in under 30 seconds and reach a working first flow in under 10 minutes.

## Current-state audit

### What is already strong

- The technical core has a coherent point of view: LangGraph supplies the underlying graph and checkpoint engine; Kortyx adds an application-facing TypeScript runtime, typed hooks, provider independence, server-side execution, streaming, interrupts, runtime persistence, session operations, MCP tools, React integration, and OpenTelemetry.
- Kortyx solves a repeated product-engineering problem rather than inventing an abstraction speculatively: teams otherwise have to assemble workflow conventions, model calls, stream protocols, UI state, human pauses, persistence, and session branching themselves.
- The documentation is substantial: roughly 9,800 lines across installation, concepts, guides, providers, Studio, production, reference, troubleshooting, and migration.
- The SDK and Studio boundary is unusually thoughtful. Studio observes workflows but does not execute them, telemetry is optional, and prompt/input/output content is excluded by default.
- The self-hosting story is real: one CLI command starts the current Studio preview, with documented credentials, persistence, deployment, backup, upgrade, and security boundaries.
- The repository has real implementation depth and automated tests rather than only a demo API wrapper.

### What prevents adoption today

1. **There is no homepage.** `/` redirects directly to `/docs/start-here`.
2. **The category is not explained.** A visitor cannot quickly tell when Kortyx is necessary, what it replaces, or why a normal model SDK is not enough.
3. **Features are not converted into saved work.** “Workflows, hooks, streaming, interrupts, persistence” is accurate but does not tell a TypeScript developer which recurring backend and frontend abstractions they no longer have to build.
4. **There is no product demonstration.** The site does not show a workflow, the streamed application experience, a human pause/resume, or Studio turning a run into an inspectable story.
5. **There is little adoption proof.** There are no user stories, public examples gallery, compatibility table, visible release history, or maturity page. The project is too early to substitute GitHub stars or logo walls for proof.
6. **The open-source boundary is easy to misunderstand.** The framework is Apache-2.0, while Studio is ELv2 source-available. “Kortyx is OSS” without a qualifier is too broad.
7. **Cloud has no safe narrative.** There is no page that says what is available today, what is coming, and what will remain independently runnable.
8. **The first-use path is code-heavy.** The current quickstart is technically complete, but a new visitor must understand several files before experiencing the core value.
9. **Missing discovery surfaces.** There are no marketing routes for examples, Studio, self-hosting, providers/integrations, changelog, use cases, or community.

### Adoption readiness score

These are directional, not analytics-derived scores.

| Area | Current | Why |
| --- | ---: | --- |
| Product differentiation | 3/5 | Strong primitives, but the wedge is not yet stated simply |
| Homepage clarity | 1/5 | Home redirects to docs |
| Documentation depth | 4/5 | Broad and careful, with a few discovery gaps |
| Time to first value | 2/5 | Complete path, but no starter command or live guided example |
| Product proof | 1/5 | No screenshots, stories, public demos, or usage evidence |
| Trust and transparency | 3/5 | Good technical caveats; licensing and maturity need a public surface |
| Community readiness | 1/5 | Contribution paths exist, but no visible community loop |
| Cloud narrative | 1/5 | Future cloud is not yet explained |

## What drives framework adoption

Framework adoption is a sequence, not a homepage conversion:

1. **Recognition:** “This is the problem I have.”
2. **Fit:** “It works with my language, stack, providers, and deployment model.”
3. **Comprehension:** “I understand its mental model and tradeoffs.”
4. **Trust:** “It is maintained, testable, secure enough, licensed clearly, and honest about maturity.”
5. **Activation:** “I can get a meaningful result quickly.”
6. **Validation:** “I can inspect failures, test edge cases, and see how production works.”
7. **Expansion:** “My team can standardize on it without being forced into a hosted service.”

An empirical study of open-source adoption found that practitioners use documentation to assess functionality, compatibility, licensing, maintenance, community adoption, use cases, ease of use, versioning, and performance. The same study found that examples and understanding functionality are among the main reasons people consult documentation. The website must expose those answers before the reference docs, not bury them inside the docs tree. See [Imani et al., 2024](https://arxiv.org/abs/2403.03819).

Current agent-framework discussions reinforce the same objections:

- People worry about version churn, ecosystem stability, and having to rebuild integrations themselves.
- Production evaluators ask about visibility into nodes and model calls, provider routing, state complexity, deployment, and vendor lock-in.
- Many developers prefer a thin SDK until they see a concrete reason to accept framework complexity.

Representative discussions: [frameworks used in production](https://www.reddit.com/r/LocalLLaMA/comments/1lmni3q/what_framework_are_you_using_to_build_ai_agents/) and [production viability and monitoring](https://www.reddit.com/r/LocalLLaMA/comments/1np8eda/what_ai_agent_framework_is_actually_production/).

This means the site must answer two skeptical questions directly:

> Why use Kortyx instead of a model SDK and application code?

> If I adopt Kortyx, what do I control and what do I depend on?

## Lessons from adjacent products

### Temporal

[Temporal](https://temporal.io/) leads with the failure developers experience, demonstrates the mechanism, names concrete use cases, adds strong proof, and clearly offers self-hosted open source and Cloud as two deployment paths.

Use for Kortyx:

- Lead with the operational problem, not framework anatomy.
- Explain the “how it works” mental model visually.
- Keep self-hosted and managed paths equally legible.
- Do not copy Temporal's scale or “battle tested” claims; Kortyx cannot substantiate those yet.

### Kestra

[Kestra](https://kestra.io/) establishes its category in one sentence, lists concrete qualifiers immediately, organizes use cases by buyer/problem, and visibly separates Open Source, Enterprise, and Cloud.

Use for Kortyx:

- Put TypeScript, explicit workflows, provider choice, self-hosting, and optional observability near the hero.
- Build use-case pages only for scenarios backed by working examples.
- Present the product editions as factual choices, not a vague “platform.”

### Mastra

[Mastra](https://mastra.ai/) shows code and product capabilities together. Visitors can see how agents, workflows, memory, server, and observability relate without first reading reference documentation.

Use for Kortyx:

- Pair each claim with real code or real UI.
- Make the workflow-to-stream-to-Studio story the central visual demonstration.
- Avoid competing on feature count. Kortyx should be the framework for explicit control, not another “all-in-one” list.

### Latitude

[Latitude](https://latitude.so/) leads with one sharp outcome, shows concrete operational behaviors, publishes usage proof, and makes setup feel small.

Use for Kortyx:

- Use one outcome-led headline.
- Show the five-minute Studio path.
- Publish real metrics only when they are meaningful and automatically sourced.

## Target audience and positioning

### Primary audience

TypeScript teams building AI features in React, Next.js, or Node where one or more of these have become true:

- the flow has several deterministic and model-driven steps;
- the UI needs live text plus structured state;
- a user or operator must approve, choose, or provide missing information;
- execution must survive a process restart;
- the team needs to inspect where time, cost, or failures occurred; or
- the team wants to change providers without rewriting orchestration.

Primary champion: senior product engineer, AI engineer, or technical founder.  
Secondary evaluator: engineering lead or platform engineer assessing reliability, privacy, deployment, and lock-in.

### Not the initial audience

- Teams that need only a single prompt/response call.
- No-code workflow builders.
- Teams looking for a hosted autonomous-agent product today.
- Buyers expecting current enterprise controls such as built-in SSO, granular RBAC, HA, or managed SLAs.

Saying who Kortyx is not for increases trust and prevents poor-fit adoption.

### Positioning statement

> For TypeScript teams building agents into real products, Kortyx is the open-source application framework that provides the workflow and frontend runtime they would otherwise have to assemble themselves. Built on LangGraph, it turns graph execution into ready-made TypeScript abstractions for model calls, streaming UI, human interrupts, persistence, resume, rollback, fork, and observability—so teams can focus on agent business logic.

### Message hierarchy

1. **Outcome:** Spend engineering time on the agent's business logic, not recurring runtime and UI plumbing.
2. **Product bridge:** Move quickly from a server-side agent workflow to a responsive React or Next.js product.
3. **Runtime:** Stream progress, pause for people, persist state, resume safely, and branch a session.
4. **Foundation:** Use LangGraph execution through a more application-oriented TypeScript API instead of assembling the integration layer yourself.
5. **Visibility:** Inspect execution with OpenTelemetry or optional self-hosted Studio.
6. **Freedom:** Run in your own TypeScript application, choose providers, and keep Studio optional.

### Recommended homepage copy

Eyebrow:

> The TypeScript application framework for agents

Headline:

> Build the agent logic. Kortyx handles the runtime.

Supporting copy:

> Built on LangGraph, Kortyx gives you ready-made TypeScript abstractions for workflows, model calls, React streaming, human interrupts, persistent state, resume, rollback, fork, and observability—so you can ship the product around your agent faster.

Primary CTA:

> Build your first workflow

Secondary CTA:

> View on GitHub

Small qualifier under CTAs:

> Framework: Apache-2.0 · Runs in your app · Studio is optional

Alternative headline worth testing after launch:

> Stop rebuilding the application around every agent.

## Product mental model

The website should show Kortyx as a layered product, not as a replacement graph engine and not as a thin LangGraph wrapper.

| Layer | Responsibility |
| --- | --- |
| Application | Agent business rules, domain services, product data, and user experience |
| Kortyx frontend | React chat state, transports, live stream pieces, structured UI, interrupt controls, abort/error handling, and session actions |
| Kortyx server runtime | Workflow definitions, nodes, model/provider hooks, routing, retries, runtime context/state, interrupts, SSE handlers, persistence adapters, checkpoints, telemetry, and Studio integration |
| LangGraph | Internal graph execution, interrupts, and checkpoint foundation |

The value is the integrated path across these layers. A developer should not have to design a custom stream protocol, reconcile paused server state with the browser, or fake rollback by trimming messages on the client.

### LangGraph relationship

State this plainly on `/framework` and in the FAQ:

> Kortyx uses LangGraph as its graph execution and checkpoint foundation. Kortyx adds the TypeScript application abstractions around it: workflow conventions, typed model hooks, providers, runtime persistence, HTTP and SSE integration, React state and rendering primitives, human-input contracts, session rollback and fork, and observability.

This positioning has three benefits:

- it gives appropriate credit to the underlying engine;
- it reassures evaluators that the graph and checkpoint model is not an untested reinvention; and
- it makes the adoption decision concrete: use LangGraph directly when you want to design the integration layer yourself; use Kortyx when you want that product layer already assembled.

Do not lead the hero with a comparison against LangGraph. Lead with saved work and faster product delivery, then explain the foundation immediately below the first product demonstration or in an FAQ.

### Verified abstraction inventory

These capabilities exist today and should be prioritized by user value rather than presented as one undifferentiated feature wall:

| Developer problem | Kortyx abstraction |
| --- | --- |
| Define and validate multi-step behavior | Versioned workflows, nodes, edges, conditional routing, retries, workflow transitions, TS/YAML/JSON formats |
| Call models consistently | `useReason`, provider-neutral options, structured output, normalized metadata and usage |
| Give agents tools | MCP client tools, bounded tool loops, emitted tool events, optional approval interrupts |
| Share safe request/runtime data | `useRuntimeContext`, node state, workflow state |
| Put people inside a running workflow | Deterministic or model-authored interrupts, typed requests/responses, choice, multi-choice, text, and custom UI metadata |
| Connect the workflow to a web product | Next.js route handlers, buffered Server Action path, SSE stream protocol, React transport helpers |
| Render an agent while it is working | `useChat`, finalized messages, in-flight text, structured-data pieces, interrupts, errors, abort, and browser storage |
| Survive runtime boundaries | In-memory development adapter and Redis-backed runtime persistence for restart-safe interrupt and checkpoint state |
| Let users revisit or branch work | Session checkpoints, regenerate, retry-with-edit, rollback, fork, undo patterns, and structured-output invalidation |
| Inspect execution | OpenTelemetry adapter, Langfuse export guidance, optional Studio telemetry and topology |
| Control sensitive telemetry | Content capture disabled by default, with separate input/output choices |

## Product and licensing language

### Approved language now

| Surface | Safe description |
| --- | --- |
| Framework | “Apache-2.0 open-source TypeScript framework” |
| Runtime | “Runs in your Node.js application and infrastructure” |
| Studio | “Optional, self-hostable observability interface; source-available preview under ELv2” |
| Cloud | “Managed Kortyx is in development” or “Join early access” |
| Production | “Production-oriented runtime primitives” or a specific claim such as “Redis-backed interrupt state survives application restarts” |
| Privacy | “Prompt, input, and output content is excluded from Kortyx telemetry by default” |

### Avoid until substantiated

- “Kortyx is fully open source.”
- “Battle tested,” “enterprise ready,” “the leading,” or “production proven.”
- “Free forever” for the whole product.
- “Zero lock-in” without explaining the framework/Studio/data boundary.
- Cloud feature, security, pricing, migration, or launch-date promises that are not committed.
- Customer logos, testimonials, or performance numbers without permission and evidence.

### Cloud page contract

The initial `/cloud` page should be a transparent early-access page, not a simulated product launch.

It should say:

- Managed Kortyx is being built.
- The current available path is the framework plus self-hosted Studio preview.
- The expected managed value is less operational work around Studio and team access, expressed as direction rather than a committed feature matrix.
- Joining the list is for product updates or design-partner access.
- The framework does not require Cloud today.

Only promise that the Apache-2.0 framework will remain independently usable if that is a committed company policy.

## Information architecture

### Launch navigation

| Navigation | Routes/content |
| --- | --- |
| Product | Framework, Studio, Cloud (Soon) |
| Developers | Docs, Examples, Providers & MCP, Changelog |
| Open Source | GitHub, Self-hosting, Contributing, License |
| Right side | GitHub, “Get started” button |

Do not add pricing until there is an actual purchasable or clearly defined Cloud offer.

### Priority routes

#### P0: required for adoption launch

- `/` — marketing homepage.
- `/framework` — mental model, LangGraph relationship, server/frontend abstraction layers, capabilities, fit, and runtime boundaries.
- `/studio` — real screenshots and a code-to-trace story; clearly labeled self-hosted preview.
- `/examples` — curated, runnable examples with problem, result, stack, and source.
- `/open-source` — licenses, what runs where, self-hosting, privacy defaults, contribution and security links.
- `/cloud` — “in development” early-access page.
- `/changelog` — human-readable product releases, separate from generated package changelogs.
- `/docs/...` — preserve the current docs and URLs.

#### P1: after the adoption baseline exists

- `/use-cases/human-in-the-loop`
- `/use-cases/structured-ai-interfaces`
- `/use-cases/long-running-agent-workflows`
- `/integrations` — model providers, MCP, Redis, OpenTelemetry, Langfuse, React, Next.js, Node.
- `/compare/model-sdk-vs-kortyx` — an educational decision guide, not an attack page.
- `/roadmap` — only if it can be maintained consistently.
- `/blog` or `/guides` — high-intent technical content.

## Homepage structure

### 1. Product status banner

> New: self-host Kortyx Studio in one command →

Link to `/studio`, not directly into a long operations guide.

### 2. Hero: outcome, code, and action

Left: the recommended headline, supporting copy, two CTAs, and precise OSS qualifier.  
Right: one animated or interactive product story using real UI and code:

1. a short workflow graph;
2. a node streaming text and structured fields;
3. a human approval interrupt;
4. the resumed run appearing in Studio.

This is not decorative animation. It is the product explanation.

### 3. “Stop rebuilding the agent application layer”

Use a three-column before/after section:

| What teams repeatedly build | Kortyx abstraction | Outcome |
| --- | --- | --- |
| Graph conventions, routing, model wrappers, and replay guards | Workflow and hook runtime built on LangGraph | Focused agent business logic |
| Custom SSE parsing, active message state, and human-input UI contracts | Stream protocol + `@kortyx/react` | Faster path from agent to product UI |
| Ad hoc resume, regenerate, rollback, and branch logic | Persistent interrupts + session checkpoints | Correct server and frontend state together |
| Trace plumbing and one-off debug views | OpenTelemetry + optional Studio | Inspectable execution story |

### 4. One agent feature, backend to frontend

Show a realistic approval workflow, not a weather bot:

`Request → gather context → reason → ask for approval → execute → return structured result`

Pair the graph with concise real Kortyx server code, the corresponding React component, and a live UI result. The user should understand where business logic, normal functions, model calls, human control, and frontend rendering each belong. Include a small “Powered by LangGraph execution” foundation label without making the engine the main story.

### 5. Core capabilities

Use outcome labels rather than package names:

- **Make behavior explicit** — typed workflows, nodes, branches, and versions.
- **Stream more than text** — messages, lifecycle, tool events, interrupts, and structured UI state.
- **Keep people in control** — pause, approve, collect input, resume, roll back, and fork.
- **Connect backend to frontend** — route handlers, a stable stream protocol, React state, transports, and lifecycle controls.
- **Choose the model at the node** — supported providers behind one runtime contract.
- **Recover runtime state** — in-memory for local work, Redis for restart-safe flows.
- **See what happened** — generic OpenTelemetry or optional Kortyx Studio.

Each card must link to a focused guide or example.

### 6. Built for the TypeScript application you already have

Show verified compatibility:

- Next.js API routes for live SSE.
- Server Actions for buffered flows.
- React client helpers.
- React frontend plus Node backend.
- OpenAI, Anthropic, Google, DeepSeek, Groq, and Mistral providers.
- MCP tools, Redis, OpenTelemetry, and Langfuse export.

Use actual supported-version data from package manifests when building this section.

### 7. Framework, Studio, and Cloud

Use three factual cards:

| Product | Available | Runs where | License/status |
| --- | --- | --- | --- |
| Framework | Today | User's app/infrastructure | Apache-2.0 OSS |
| Studio | Self-hosted preview | User's infrastructure | ELv2 source-available |
| Cloud | In development | Managed by Kortyx | Early access; details to follow |

Add a small architecture diagram showing that the application executes workflows and emits optional telemetry. Studio/Cloud does not sit in the execution path.

### 8. Proof without pretending scale

Until customer proof exists, use engineering proof:

- current version and latest release date;
- number of automated tests, generated from CI rather than hard-coded;
- supported providers and runtimes;
- public security policy and contribution guide;
- content-capture defaults;
- Docker architecture support;
- a link to release notes and known preview limitations.

Do not make “1 GitHub star” a homepage proof point. Ask for the star in the nav/footer, but earn trust through transparency and a working demo.

### 9. Five-minute Studio path

Show:

```bash
npx kortyx studio start
```

Then a real Studio screenshot and a concise explanation of what appears after the first run. Link to setup and the current boundary/limitations.

### 10. Final CTA

> Make your first AI workflow explicit.

Primary: “Start the quickstart”  
Secondary: “Explore examples”

## Example strategy

The first public examples should demonstrate why Kortyx exists, not only how to call a model.

### Example 1: approval workflow

- Draft a customer action or operational change.
- Stream a structured preview.
- Pause for approval.
- Resume safely after a simulated server restart.
- Inspect the run in Studio.

This should be the hero example.

### Example 2: structured research canvas

- Use the existing Canvas example.
- Stream partial structured fields into the UI.
- Show checkpoint, rollback, regenerate, and fork.

### Example 3: provider-switching support agent

- Keep workflow code constant.
- Select providers per node.
- Show generic OpenTelemetry export and optional Studio.

Every example page needs:

- a 15-second product outcome;
- a screenshot or short recording;
- “Run locally” instructions;
- source link;
- architecture and data-flow diagram;
- provider, persistence, and license requirements;
- what is intentionally simplified for the demo.

## Documentation changes that support adoption

The docs are already the strongest website asset. Preserve their current URL structure and focus on entry points.

### P0 documentation work

- Add “Why Kortyx?” with use/don't-use guidance.
- Add “Kortyx and LangGraph” with the precise dependency boundary, what Kortyx adds, and when direct LangGraph is the better choice.
- Add one conceptual “How Kortyx works” page covering app, workflow, node, hook, stream, persistence, and telemetry in a single diagram.
- Reduce the primary quickstart to one copyable path and move alternatives below it.
- Add MCP tools to the visible docs navigation; the package exists but is currently hard to discover.
- Add a tested compatibility page: Node version, React/Next.js support, provider packages, storage adapters, and deployment limitations.
- Add a version-support policy and pre-1.0 change expectations.
- Add a maturity/limitations page for both Framework and Studio.
- Link every marketing claim to the most relevant guide or example.

### Activation improvement

Create a starter command or repository template so the first meaningful result does not require manually assembling four files. The target journey is:

1. create or add Kortyx;
2. set one provider key;
3. run the app;
4. see streamed output;
5. optionally start Studio and inspect the run.

Target time: under 10 minutes for the framework, under 5 additional minutes for Studio.

## Visual direction

The current docs use a clean neutral system with a blue-violet primary. Preserve the docs readability, but give the marketing surface a stronger product identity.

Recommended direction:

- Developer-tool precision rather than generic AI gradients.
- Dark-first product demonstrations with light and dark site support.
- Workflow paths, checkpoints, and stream events as the recurring visual language.
- Real Studio captures and real rendered example UIs.
- Code and UI shown side by side to express “explicit behavior becomes visible execution.”
- Restrained motion that demonstrates progression, pause, resume, and trace—not ambient decoration.

Avoid neural-network artwork, robots, floating glass cards, invented dashboards, and feature-icon walls with no product evidence.

## Delivery plan

### Phase 0 — positioning and evidence, 2–3 days

- Approve the product model and licensing language.
- Decide whether “the framework remains independently usable” is a formal Cloud commitment.
- Choose the hero example and make sure it is reproducible.
- Capture real Studio screens and define which current limitations must remain visible.
- Establish the initial analytics funnel.

Exit condition: every homepage claim has a current product proof or is removed.

### Phase 1 — adoption foundation, 1–2 weeks

- Replace the root redirect with the marketing homepage.
- Expand the nav and footer.
- Build `/framework`, `/studio`, `/examples`, `/open-source`, `/cloud`, and `/changelog`.
- Add homepage and page-level metadata, sitemap entries, social cards, and structured data.
- Add the hero example, screenshots, licensing table, and maturity language.
- Preserve all docs paths and make Docs visually consistent with the marketing shell.
- Add privacy-conscious funnel analytics.

Exit condition: a first-time visitor can explain Kortyx, identify fit, choose OSS/Studio/Cloud paths, and start the quickstart without external explanation.

### Phase 2 — activation, 1–2 weeks

- Ship a starter CLI/template.
- Turn the three example concepts into polished runnable examples.
- Add “How Kortyx works,” compatibility, maturity, and version-policy docs.
- Surface MCP, OpenTelemetry, Redis, and provider integration pages.
- Add a public feedback path linked from examples and docs.

Exit condition: a TypeScript developer reaches a meaningful first flow in under 10 minutes and can inspect it in Studio shortly afterward.

### Phase 3 — proof and acquisition, ongoing

- Publish the first three honest user stories, even if they are small teams or design partners.
- Write high-intent guides around human-in-the-loop workflows, structured streaming, restart-safe agents, and model-SDK-to-workflow migration.
- Publish a maintained comparison/decision guide.
- Add real usage numbers only once they are credible and automatically refreshed.
- Turn common support questions into docs and product fixes.

## Measurement plan

### Primary adoption funnel

`Homepage visit → quickstart click → install/start → first completed workflow → second session or Studio start`

The website can measure the first two steps. Product telemetry for later steps must be explicit, privacy-conscious, and optional.

### Launch metrics

- Homepage primary and secondary CTA click-through.
- Quickstart completion proxy, such as successful starter creation if telemetry is explicitly enabled.
- Median time to first successful streamed result in usability tests.
- Studio guide starts and first-run success in usability tests.
- Example source clicks and template uses.
- Returning docs visitors within 7 and 30 days.
- GitHub stars, discussions, issues, and outside contributors as secondary signals—not the product goal.
- Cloud early-access conversion and the job-to-be-done selected on signup.

### Qualitative loop

Ask every early adopter:

1. What were you building before you found Kortyx?
2. Why was a model SDK alone no longer enough?
3. What almost stopped you from adopting Kortyx?
4. Which concept took longest to understand?
5. What would make you comfortable running it in production?

Use the answers to change product and docs before adding more marketing pages.

## Concrete implementation backlog

### Must ship

- [ ] Marketing homepage at `/`.
- [ ] Marketing-aware navbar and footer.
- [ ] Framework page with an architecture diagram.
- [ ] Clear LangGraph attribution and direct-LangGraph/Kortyx decision guidance.
- [ ] Studio page with real screenshots and preview limitations.
- [ ] Examples gallery with one flagship end-to-end example.
- [ ] Open-source and licensing page.
- [ ] Cloud early-access page with no unavailable-product ambiguity.
- [ ] Human-readable changelog page.
- [ ] Accurate site-wide title, description, Open Graph, X, sitemap, and schema markup.
- [ ] Quickstart and Studio CTA events.
- [ ] Mobile, keyboard, contrast, reduced-motion, and performance validation.

### Must not block launch

- [ ] Blog engine.
- [ ] Complex CMS.
- [ ] Pricing.
- [ ] Enterprise pages.
- [ ] Broad comparison matrix.
- [ ] Many use-case pages.
- [ ] Community forum separate from GitHub Discussions.

## Launch acceptance criteria

- The root URL no longer redirects to docs.
- In a five-person test, at least four people can state what Kortyx does and who it is for after viewing only the first viewport.
- No page calls all of Kortyx open source without explaining the Studio license boundary.
- No page implies Cloud is currently available.
- The homepage hero uses real product code and UI.
- All feature claims link to documentation, source, or a runnable example.
- The flagship example demonstrates workflow control, streaming, a human interrupt, persistence, and observability.
- Docs URLs remain stable.
- The site has no fabricated logos, testimonials, metrics, or implied enterprise capabilities.
- The framework quickstart is validated by someone outside the core project.

## Final recommendation

Build the homepage and product model first. Do not start with a blog, a giant comparison grid, or a Cloud waitlist alone.

Kortyx's most defensible story is not “another graph engine” or “another all-in-one agent framework.” It is the TypeScript application layer its creator kept rebuilding around LangGraph: the server and frontend abstractions that turn agent business logic into a working, interactive, resumable, and observable product.
