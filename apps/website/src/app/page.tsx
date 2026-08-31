import {
  ArrowRight,
  Braces,
  Check,
  Cloud,
  Code2,
  Eye,
  Github,
  GitPullRequestArrow,
  Layers3,
  MessageSquareMore,
  PackageOpen,
  Pause,
  Radio,
  RefreshCw,
  Route,
  Server,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AgentRuntimeDemo } from "@/components/marketing/agent-runtime-demo";
import { FlowLine } from "@/components/marketing/flow-line";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/reveal";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils/cn";

const pageDescription =
  "Kortyx is a TypeScript framework for agent workflows, streamed React state, human interrupts, persisted runs, session branching, and tracing.";

export const metadata: Metadata = {
  title: {
    absolute: "Kortyx | Write the agent logic. The runtime is already built.",
  },
  description: pageDescription,
  keywords: [
    "TypeScript agent framework",
    "AI agent workflows",
    "human in the loop",
    "structured streaming",
    "agent runtime",
    "Kortyx",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Write the agent logic. The runtime is already built.",
    description: pageDescription,
    type: "website",
    url: siteConfig.url,
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: "Kortyx, the TypeScript application framework for agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Write the agent logic. The runtime is already built.",
    description: pageDescription,
    creator: siteConfig.twitterHandle,
    images: [siteConfig.ogImage],
  },
};

const missingLayerCards = [
  {
    icon: Route,
    label: "Workflow runtime",
    title: "Put agent behavior in a workflow",
    description:
      "Define model calls, tools, routes, retries, and replay-safe state in versioned TypeScript workflows.",
    accent: "violet",
    visual: (
      <div className="mt-7 flex items-center gap-2" aria-hidden="true">
        {["input", "reason", "approve", "ship"].map((node, index) => (
          <div key={node} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1 rounded-lg border border-white/9 bg-black/20 px-2 py-2 text-center font-mono text-[10px] text-white/44">
              {node}
            </div>
            {index < 3 ? <FlowLine className="h-3 w-4 shrink-0" /> : null}
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Radio,
    label: "Frontend bridge",
    title: "Stream text and typed UI state",
    description:
      "One SSE protocol carries text, structured data, tool events, interrupts, errors, and abort state into React.",
    accent: "blue",
    visual: (
      <div className="mt-7 space-y-2" aria-hidden="true">
        <div className="h-1.5 w-[88%] rounded-full bg-gradient-to-r from-[#64bfff] via-[#64bfff]/45 to-transparent" />
        <div className="h-1.5 w-[68%] rounded-full bg-gradient-to-r from-[#64bfff]/75 to-transparent" />
        <div className="flex gap-1.5 pt-2">
          <span className="rounded-md border border-sky-300/15 bg-sky-300/5 px-2 py-1 font-mono text-[10px] text-sky-200/55">
            text-delta
          </span>
          <span className="rounded-md border border-violet-300/15 bg-violet-300/5 px-2 py-1 font-mono text-[10px] text-violet-200/55">
            structured-data
          </span>
          <span className="rounded-md border border-amber-300/15 bg-amber-300/5 px-2 py-1 font-mono text-[10px] text-amber-200/55">
            interrupt
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: GitPullRequestArrow,
    label: "Session semantics",
    title: "Resume, roll back, and branch correctly",
    description:
      "Session checkpoints keep the React transcript and server workflow state together during regenerate, undo, rollback, and fork.",
    accent: "green",
    visual: (
      <div
        className="mt-7 rounded-xl border border-white/8 bg-black/20 p-3"
        aria-hidden="true"
      >
        <div className="flex items-center gap-2 font-mono text-[10px] text-white/35">
          <span className="size-2 rounded-full bg-emerald-300" />
          cp_03
          <span className="h-px flex-1 bg-white/8" />
          <span className="size-2 rounded-full bg-[#8b7cff]" />
          cp_04
          <span className="h-px flex-1 border-t border-dashed border-white/12" />
          <span className="rounded-full border border-white/10 px-2 py-0.5">
            fork
          </span>
        </div>
      </div>
    ),
  },
];

const capabilityCards = [
  {
    icon: Pause,
    title: "Human interrupts",
    description:
      "Pause for a typed choice, text response, or custom UI. Resume the same run from its checkpoint.",
    detail: "useInterrupt()",
  },
  {
    icon: Braces,
    title: "Structured streaming",
    description:
      "Stream validated fields into a preview, card, table, or editor while the model is still working.",
    detail: "text · set · append",
  },
  {
    icon: RefreshCw,
    title: "Runtime persistence",
    description:
      "Keep runs in memory locally. Store paused runs and checkpoints in Redis when you deploy multiple workers.",
    detail: "memory → redis",
  },
  {
    icon: PackageOpen,
    title: "Providers and MCP",
    description:
      "Call OpenAI, Anthropic, Google, DeepSeek, Groq, or Mistral. Give each node request-scoped MCP tools and approval rules.",
    detail: "provider neutral",
  },
  {
    icon: Eye,
    title: "OpenTelemetry-native",
    description:
      "Send model calls, tools, workflow transitions, timing, tokens, and cost to OpenTelemetry or Kortyx Studio.",
    detail: "your backend",
  },
  {
    icon: Code2,
    title: "React and Next.js",
    description:
      "Connect React through an API route, a buffered Server Action, or a separate Node backend.",
    detail: "server → interface",
  },
];

const faqs = [
  {
    question: "What does Kortyx replace?",
    answer:
      "Kortyx replaces the repeated runtime and React integration code around agent workflows: model hooks, streamed events, checkpoints, human input, session actions, and client state. Your business rules and product interface remain yours.",
  },
  {
    question: "Does Kortyx run inside my application?",
    answer:
      "Yes. The framework runs in your Node server. Provider credentials stay server-side, and your workflows, services, and product data remain in the application you operate.",
  },
  {
    question: "Do I need Kortyx Studio or Cloud?",
    answer:
      "No. The framework works without either. Self-hosted Studio is an optional preview for inspecting runs and sessions. Managed Cloud is in development.",
  },
  {
    question: "Can I add Kortyx to an existing Next.js or Node application?",
    answer:
      "Yes. Next.js can connect through a live SSE route or a buffered Server Action. React can also connect to a separate Node backend.",
  },
  {
    question: "How do human approvals work?",
    answer:
      "A workflow emits a typed interrupt and checkpoints the active run. React renders a choice, form, or custom component. The response resumes that same run from its checkpoint.",
  },
  {
    question: "What is open source?",
    answer:
      "The Kortyx framework is Apache-2.0. Self-hosted Studio uses ELv2. The managed Cloud service is still in development, with commercial details to follow.",
  },
];

function ProductJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteConfig.url}/#organization`,
        name: siteConfig.name,
        url: siteConfig.url,
        sameAs: siteConfig.sameAs,
      },
      {
        "@type": "WebSite",
        "@id": `${siteConfig.url}/#website`,
        name: siteConfig.name,
        url: siteConfig.url,
        publisher: { "@id": `${siteConfig.url}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteConfig.url}/#software`,
        name: siteConfig.name,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Cross-platform",
        programmingLanguage: "TypeScript",
        description: pageDescription,
        url: siteConfig.url,
        downloadUrl: "https://www.npmjs.com/package/kortyx",
        codeRepository: siteConfig.repositoryUrl,
        license: "https://www.apache.org/licenses/LICENSE-2.0",
        isAccessibleForFree: true,
        publisher: { "@id": `${siteConfig.url}/#organization` },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Structured data is generated from local constants.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export default function Home() {
  return (
    <main className="marketing-page min-h-screen overflow-hidden bg-[#08080c] text-white">
      <ProductJsonLd />
      <section className="marketing-grid relative isolate border-b border-white/8">
        <div className="marketing-orb marketing-orb-one" />
        <div className="marketing-orb marketing-orb-two" />

        <div className="marketing-container marketing-hero-pad relative">
          <div className="grid items-center gap-14 xl:grid-cols-[0.82fr_1.18fr] xl:gap-16">
            <Reveal className="mx-auto max-w-2xl text-center xl:mx-0 xl:text-left">
              <div className="mb-5 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-[#9e91ff] uppercase">
                <Layers3 className="size-3.5" />
                The TypeScript application framework for agents
              </div>
              <h1 className="marketing-hero-title">
                Write the agent logic.
                <span className="marketing-gradient-text -mb-[0.1em] mt-2 block bg-gradient-to-r from-[#a89cff] via-[#75bfff] to-[#78e0bd] bg-clip-text pb-[0.1em] text-transparent">
                  The runtime is already built.
                </span>
              </h1>
              <p className="marketing-lede mx-auto mt-7 text-balance text-white/56 xl:mx-0">
                Kortyx packages the TypeScript runtime and React code that kept
                showing up in every agent project: workflows, streaming, human
                interrupts, persistent state, resume, rollback, fork, and
                tracing.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row xl:justify-start">
                <Link
                  href="/docs/getting-started/quickstart-nextjs"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#09090d] shadow-[0_10px_40px_rgba(0,0,0,0.28)] transition-transform hover:-translate-y-0.5"
                >
                  Build your first workflow
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="https://github.com/kortyx-io/kortyx"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.035] px-5 text-sm font-medium text-white/75 transition-colors hover:border-white/22 hover:bg-white/[0.065] hover:text-white"
                >
                  <Github className="size-4" />
                  View on GitHub
                </a>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[10px] tracking-[0.08em] text-white/30 uppercase xl:justify-start">
                <span>Apache-2.0 framework</span>
                <span className="hidden size-0.5 rounded-full bg-white/30 sm:block" />
                <span>Runs in your app</span>
                <span className="hidden size-0.5 rounded-full bg-white/30 sm:block" />
                <span>Composable runtime</span>
              </div>
            </Reveal>

            <Reveal
              variant="scale"
              delay={0.18}
              className="relative mx-auto w-full max-w-3xl xl:max-w-none"
            >
              <div className="marketing-float relative">
                <div className="absolute -inset-8 -z-10 rounded-[40px] bg-[#725fff]/8 blur-3xl" />
                <AgentRuntimeDemo />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="border-b border-white/8 bg-[#0a0a0f]">
        <Reveal className="marketing-container flex flex-wrap items-center justify-center gap-x-10 gap-y-4 py-5 font-mono text-[10px] tracking-[0.12em] text-white/30 uppercase lg:justify-between">
          <span>Defined workflows</span>
          <span>Structured streaming</span>
          <span>Human in the loop</span>
          <span>Persistent runtime state</span>
          <span>React client</span>
          <span>OpenTelemetry</span>
        </Reveal>
      </section>

      <section
        id="why-kortyx"
        className="marketing-section relative border-b border-white/8"
      >
        <Reveal className="marketing-container marketing-section-pad">
          <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <div>
              <p className="marketing-kicker">Why Kortyx exists</p>
              <h2 className="marketing-section-title mt-5 max-w-xl">
                I kept rebuilding the same code around every agent.
              </h2>
            </div>
            <div className="max-w-2xl lg:pt-12">
              <p className="text-balance text-xl leading-8 text-white/62 sm:text-2xl sm:leading-9">
                Every project needed workflow conventions, model hooks, stream
                parsing, React state, human input, persistence, replay, and
                tracing.
              </p>
              <p className="mt-5 text-base leading-7 text-white/38">
                Kortyx puts that repeated code into a TypeScript framework. You
                write the workflow, business rules, and interface for your
                product.
              </p>
            </div>
          </div>

          <Stagger className="mt-16 grid gap-4 lg:grid-cols-3">
            {missingLayerCards.map((card) => {
              const Icon = card.icon;
              return (
                <StaggerItem
                  as="article"
                  key={card.title}
                  className={cn(
                    "marketing-card group relative min-h-[330px] overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.025] p-6 transition-transform duration-500 hover:-translate-y-1 sm:p-7",
                    card.accent === "violet" && "marketing-card-violet",
                    card.accent === "blue" && "marketing-card-blue",
                    card.accent === "green" && "marketing-card-green",
                  )}
                >
                  <div className="flex items-center gap-2.5 font-mono text-[10px] tracking-[0.12em] text-white/32 uppercase">
                    <Icon className="size-4 text-white/55" />
                    {card.label}
                  </div>
                  <h3 className="mt-8 text-2xl leading-tight font-semibold tracking-[-0.035em] text-white">
                    {card.title}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-white/42">
                    {card.description}
                  </p>
                  {card.visual}
                </StaggerItem>
              );
            })}
          </Stagger>
        </Reveal>
      </section>

      <section
        id="product"
        className="relative border-b border-white/8 bg-[#0a0a0f]"
      >
        <Reveal className="marketing-container marketing-section-pad">
          <div className="mx-auto max-w-3xl text-center">
            <p className="marketing-kicker justify-center">Shared run state</p>
            <h2 className="marketing-section-title mt-5">
              The workflow and React UI read the same run.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-7 text-white/44 sm:text-lg">
              Server events map directly to the active React interface. Kortyx
              runs inside your application and leaves the workflow engine
              accessible.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-5xl">
            <Stagger direction={-1} className="relative space-y-3">
              {[
                {
                  number: "04",
                  icon: Sparkles,
                  title: "Your product",
                  detail:
                    "Business rules · domain services · product data · interface",
                  style: "border-white/12 bg-white/[0.055]",
                },
                {
                  number: "03",
                  icon: MessageSquareMore,
                  title: "@kortyx/react",
                  detail:
                    "Chat lifecycle · live pieces · interrupts · session actions",
                  style: "border-sky-300/15 bg-sky-300/[0.035]",
                },
                {
                  number: "02",
                  icon: Workflow,
                  title: "Kortyx server runtime",
                  detail:
                    "Workflows · hooks · providers · persistence · transports · telemetry",
                  style: "border-violet-300/20 bg-violet-300/[0.05]",
                },
                {
                  number: "01",
                  icon: Layers3,
                  title: "Your infrastructure",
                  detail:
                    "Database · model providers · application server · telemetry",
                  style: "border-white/8 bg-black/20",
                },
              ].map((layer) => {
                const Icon = layer.icon;
                return (
                  <StaggerItem
                    key={layer.number}
                    className={cn(
                      "relative grid items-center gap-5 rounded-2xl border p-5 backdrop-blur sm:grid-cols-[3rem_1fr_auto] sm:px-6",
                      layer.style,
                    )}
                  >
                    <span className="font-mono text-[10px] text-white/20">
                      {layer.number}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl border border-white/8 bg-black/20 text-white/55">
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <h3 className="text-sm font-medium text-white">
                          {layer.title}
                        </h3>
                        <p className="mt-1 text-xs text-white/34 sm:hidden">
                          {layer.detail}
                        </p>
                      </div>
                    </div>
                    <p className="hidden max-w-md text-right font-mono text-[10px] leading-4 text-white/28 sm:block">
                      {layer.detail}
                    </p>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </div>
        </Reveal>
      </section>

      <section className="relative border-b border-white/8 bg-[#0a0a0f]">
        <Reveal className="marketing-container marketing-section-pad grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-20">
          <div>
            <p className="marketing-kicker">A workflow people recognize</p>
            <h2 className="marketing-section-title mt-5">
              A refund request becomes a reviewable decision.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/44">
              The workflow finds the order, checks policy, drafts a typed
              recommendation, pauses for approval, then resumes to issue the
              refund. Each step maps to code and visible interface state.
            </p>
            <Link
              href="/examples"
              className="group mt-8 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-white/72 hover:text-white"
            >
              Walk through the example
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-white/9 bg-[#0d0d13] shadow-[0_24px_90px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <p className="text-sm font-medium">Refund request #4831</p>
                <p className="mt-1 font-mono text-[10px] text-white/28">
                  MAYA LOPEZ · WIRELESS KEYBOARD
                </p>
              </div>
              <span className="rounded-full border border-emerald-300/15 bg-emerald-300/6 px-2 py-1 font-mono text-[10px] text-emerald-200/70">
                REVIEW
              </span>
            </div>
            <Stagger className="grid gap-px bg-white/8 sm:grid-cols-2">
              {[
                [
                  "Request",
                  "Wrong keyboard layout. Customer asked for a refund to the original card.",
                ],
                [
                  "Policy match",
                  "Delivered 12 days ago · unopened · refund eligible.",
                ],
                [
                  "Recommendation",
                  "Refund $84.00 and close the ticket after confirmation.",
                ],
                [
                  "Human input",
                  "Approve the refund or escalate the request to a specialist.",
                ],
              ].map(([title, description]) => (
                <StaggerItem
                  as="article"
                  key={title}
                  className="min-h-36 bg-[#0d0d13] p-5"
                >
                  <p className="font-mono text-[10px] tracking-[0.11em] text-[#9f91ff] uppercase">
                    {title}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-white/46">
                    {description}
                  </p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </Reveal>
      </section>

      <section className="marketing-section relative border-b border-white/8">
        <Reveal className="marketing-container marketing-section-pad">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="marketing-kicker">Included in the framework</p>
              <h2 className="marketing-section-title mt-5 max-w-3xl">
                The code I needed on every agent project.
              </h2>
            </div>
            <Link
              href="/docs/start-here"
              className="group inline-flex min-h-9 shrink-0 items-center gap-2 text-sm font-medium text-white/52 hover:text-white"
            >
              Read the framework docs
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <Stagger className="mt-14 grid gap-px overflow-hidden rounded-[24px] border border-white/8 bg-white/8 sm:grid-cols-2 lg:grid-cols-3">
            {capabilityCards.map((capability) => {
              const Icon = capability.icon;
              return (
                <StaggerItem
                  as="article"
                  key={capability.title}
                  className="group min-h-[260px] bg-[#0b0b10] p-6 transition-colors hover:bg-[#101018] sm:p-7"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl border border-white/8 bg-white/[0.035] text-[#9f91ff] transition-transform group-hover:-rotate-3 group-hover:scale-105">
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="font-mono text-[10px] tracking-[0.09em] text-white/20 uppercase">
                      {capability.detail}
                    </span>
                  </div>
                  <h3 className="mt-10 text-xl font-semibold tracking-[-0.025em] text-white">
                    {capability.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/38">
                    {capability.description}
                  </p>
                </StaggerItem>
              );
            })}
          </Stagger>
        </Reveal>
      </section>

      <section className="marketing-section relative border-b border-white/8">
        <Reveal className="marketing-container marketing-section-pad grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:gap-20">
          <div>
            <p className="marketing-kicker">Start with two packages</p>
            <h2 className="marketing-section-title mt-5">
              Install the runtime. Add the React client when you need it.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/44">
              Start on the server with one provider. The quickstart then wires a
              live Next.js route and the client state needed to render text,
              structured data, interrupts, and errors.
            </p>
            <Link
              href="/docs/getting-started/quickstart-nextjs"
              className="group mt-8 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-white/72 hover:text-white"
            >
              Follow the Next.js quickstart
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-[22px] border border-white/9 bg-[#09090e] font-mono shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3 text-[10px] text-white/28">
              <span className="size-2 rounded-full bg-[#ff5f57]" />
              <span className="size-2 rounded-full bg-[#febc2e]" />
              <span className="size-2 rounded-full bg-[#28c840]" />
              <span className="ml-2">terminal</span>
            </div>
            <div className="space-y-8 p-6 text-xs sm:p-8">
              <div>
                <p className="text-white/24"># framework + one provider</p>
                <p className="mt-2 text-white/82">
                  <span className="text-[#8f80ff]">$</span> pnpm add kortyx
                  @kortyx/google
                </p>
              </div>
              <div>
                <p className="text-white/24"># React chat and stream state</p>
                <p className="mt-2 text-white/82">
                  <span className="text-[#8f80ff]">$</span> pnpm add
                  @kortyx/react
                </p>
              </div>
              <div className="grid gap-2 border-t border-white/8 pt-6 text-[10px] text-white/34 sm:grid-cols-3">
                <span>01 define a workflow</span>
                <span>02 expose an SSE route</span>
                <span>03 render live pieces</span>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section
        id="open-source"
        className="relative border-b border-white/8 bg-[#0a0a0f]"
      >
        <Reveal className="marketing-container marketing-section-pad">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <p className="marketing-kicker">Licensing and deployment</p>
              <h2 className="marketing-section-title mt-5">
                Your agent runs in your application.
              </h2>
              <p className="mt-6 text-base leading-7 text-white/42">
                The framework does not require Studio or a managed control
                plane. Add visibility when you want it, and keep the execution
                path under your control.
              </p>
              <div className="mt-8 space-y-3">
                {[
                  "Provider credentials stay server-side",
                  "Prompt, input, and output telemetry is off by default",
                  "OpenTelemetry works without Kortyx Studio",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 text-sm text-white/52"
                  >
                    <span className="grid size-5 place-items-center rounded-full bg-emerald-300/8 text-emerald-300">
                      <Check className="size-3" strokeWidth={2.5} />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <article className="relative overflow-hidden rounded-[22px] border border-violet-300/20 bg-violet-300/[0.055] p-6 sm:col-span-3 lg:col-span-1">
                <span className="grid size-10 place-items-center rounded-xl border border-violet-300/15 bg-violet-300/8 text-violet-200">
                  <PackageOpen className="size-[18px]" />
                </span>
                <p className="mt-8 font-mono text-[10px] tracking-[0.1em] text-violet-200/55 uppercase">
                  Available now
                </p>
                <h3 className="mt-2 text-xl font-semibold">Framework</h3>
                <p className="mt-3 text-sm leading-6 text-white/40">
                  The TypeScript runtime, providers, React client, CLI, and
                  telemetry API.
                </p>
                <p className="mt-8 font-mono text-[10px] text-white/28">
                  Apache-2.0 · you host
                </p>
              </article>

              <article className="relative overflow-hidden rounded-[22px] border border-sky-300/15 bg-sky-300/[0.035] p-6 sm:col-span-3 lg:col-span-1">
                <span className="grid size-10 place-items-center rounded-xl border border-sky-300/15 bg-sky-300/8 text-sky-200">
                  <Server className="size-[18px]" />
                </span>
                <p className="mt-8 font-mono text-[10px] tracking-[0.1em] text-sky-200/55 uppercase">
                  Self-hosted preview
                </p>
                <h3 className="mt-2 text-xl font-semibold">Studio</h3>
                <p className="mt-3 text-sm leading-6 text-white/40">
                  Optional observability for runs, sessions, workflows,
                  interrupts, timing, tokens, and cost.
                </p>
                <p className="mt-8 font-mono text-[10px] text-white/28">
                  ELv2 · you host
                </p>
              </article>

              <article className="relative overflow-hidden rounded-[22px] border border-white/8 bg-white/[0.025] p-6 sm:col-span-3 lg:col-span-1">
                <span className="grid size-10 place-items-center rounded-xl border border-white/8 bg-white/[0.035] text-white/45">
                  <Cloud className="size-[18px]" />
                </span>
                <p className="mt-8 font-mono text-[10px] tracking-[0.1em] text-white/28 uppercase">
                  In development
                </p>
                <h3 className="mt-2 text-xl font-semibold">Cloud</h3>
                <p className="mt-3 text-sm leading-6 text-white/40">
                  Cloud is in development for teams that want Kortyx to operate
                  Studio.
                </p>
                <p className="mt-8 font-mono text-[10px] text-white/20">
                  Details to follow
                </p>
              </article>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="faq" className="bg-[#f4f3f8] text-[#111426]">
        <Reveal className="marketing-container marketing-section-pad">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <p className="font-mono text-[10px] font-semibold tracking-[0.15em] text-[#6044d8] uppercase">
                Common questions
              </p>
              <h2 className="marketing-section-title mt-5 max-w-xl">
                What teams ask before they start.
              </h2>
              <p className="mt-6 max-w-md text-base leading-7 text-[#111426]/52">
                The short version on integration, deployment, human input, and
                what is available today.
              </p>
            </div>

            <Stagger className="border-t border-[#111426]/14">
              {faqs.map((faq, index) => (
                <StaggerItem
                  as="article"
                  key={faq.question}
                  className="grid gap-4 border-b border-[#111426]/14 py-7 sm:grid-cols-[3rem_1fr] sm:gap-6 sm:py-8"
                >
                  <span className="font-mono text-[10px] text-[#6044d8]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold tracking-[-0.025em] sm:text-2xl">
                      {faq.question}
                    </h3>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#111426]/54 sm:text-base sm:leading-7">
                      {faq.answer}
                    </p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </Reveal>
      </section>

      <MarketingCta />
      <MarketingFooter />
    </main>
  );
}
