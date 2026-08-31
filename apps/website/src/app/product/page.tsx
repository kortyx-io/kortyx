import {
  ArrowDown,
  ArrowRight,
  Braces,
  GitBranch,
  MessageSquareMore,
  Pause,
  Radio,
  RefreshCw,
  Workflow,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FlowLine } from "@/components/marketing/flow-line";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingPageJsonLd } from "@/components/marketing/marketing-page-json-ld";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/reveal";
import { createMarketingMetadata } from "@/lib/metadata";

const pageTitle = "TypeScript Agent Runtime";
const pageDescription =
  "See how Kortyx keeps TypeScript workflows, streamed React state, human interrupts, persisted runs, resume, rollback, and fork in sync.";

export const metadata: Metadata = createMarketingMetadata({
  title: pageTitle,
  description: pageDescription,
  pathname: "/product",
  imagePath: "/product/opengraph-image",
  imageAlt: "Kortyx TypeScript agent runtime",
  keywords: [
    "TypeScript agent runtime",
    "AI agent framework",
    "human in the loop",
    "persistent agent workflows",
    "React agent UI",
    "structured streaming",
  ],
});

const lifecycle = [
  {
    icon: Workflow,
    step: "01",
    title: "Run",
    text: "Model calls, tools, services, routing, and retries live in focused TypeScript nodes.",
    color: "bg-[#7657ff]",
  },
  {
    icon: Radio,
    step: "02",
    title: "Stream",
    text: "Text, validated fields, tool events, and errors reach the interface over one protocol.",
    color: "bg-[#1683ff]",
  },
  {
    icon: Pause,
    step: "03",
    title: "Wait",
    text: "The workflow checkpoints while React renders a choice, form, or custom component.",
    color: "bg-[#f26b3a]",
  },
  {
    icon: GitBranch,
    step: "04",
    title: "Revisit",
    text: "Regenerate, roll back, or fork with transcript and server state kept together.",
    color: "bg-[#16a87c]",
  },
];

function ProductCode() {
  return (
    <pre className="overflow-x-auto font-mono text-[11px] leading-6 sm:text-xs">
      <code>
        <span className="text-[#6f7c99]">{"// review-refund.node.ts\n"}</span>
        <span className="text-[#d687ff]">{"const "}</span>
        <span className="text-[#f7f8ff]">{"result "}</span>
        <span className="text-[#d687ff]">{"= await "}</span>
        <span className="text-[#70c7ff]">{"useReason"}</span>
        <span className="text-[#ffcf6f]">
          {"<RefundDecision, Review, Action>"}
        </span>
        <span className="text-[#f7f8ff]">{"({\n"}</span>
        <span className="text-[#93a1bd]">{"  id: "}</span>
        <span className="text-[#84e3b7]">{'"refund-review"'}</span>
        <span className="text-[#f7f8ff]">{",\n"}</span>
        <span className="text-[#93a1bd]">{"  model: "}</span>
        <span className="text-[#70c7ff]">{"google"}</span>
        <span className="text-[#f7f8ff]">{"("}</span>
        <span className="text-[#84e3b7]">{'"gemini-2.5-flash"'}</span>
        <span className="text-[#f7f8ff]">{"),\n"}</span>
        <span className="text-[#93a1bd]">{"  input: orderAndPolicy,\n"}</span>
        <span className="text-[#93a1bd]">{"  outputSchema: "}</span>
        <span className="text-[#ffcf6f]">{"refundDecisionSchema"}</span>
        <span className="text-[#f7f8ff]">{",\n"}</span>
        <span className="text-[#93a1bd]">{"  structured: { fields: {\n"}</span>
        <span className="text-[#84e3b7]">{'    summary: "text-delta",\n'}</span>
        <span className="text-[#84e3b7]">{'    recommendation: "set",\n'}</span>
        <span className="text-[#93a1bd]">{"  } },\n"}</span>
        <span className="text-[#f26b8a]">{"  interrupt: {\n"}</span>
        <span className="text-[#f26b8a]">
          {'    schemaId: "refund-approval",\n'}
        </span>
        <span className="text-[#f26b8a]">
          {"    requestSchema, responseSchema,\n"}
        </span>
        <span className="text-[#f26b8a]">{"  },\n"}</span>
        <span className="text-[#f7f8ff]">{"});"}</span>
      </code>
    </pre>
  );
}

export default function ProductPage() {
  return (
    <main className="marketing-page min-h-screen overflow-hidden bg-[#f4f3f8] text-[#111426]">
      <MarketingPageJsonLd
        name={pageTitle}
        description={pageDescription}
        pathname="/product"
      />
      <section className="relative overflow-hidden border-b border-white/8 bg-[#08080c] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(118,87,255,0.22),transparent_32%),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:auto,48px_48px,48px_48px]" />
        <Reveal className="marketing-container marketing-hero-pad relative grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
          <div>
            <p className="font-mono text-[10px] font-semibold tracking-[0.15em] text-[#a89cff] uppercase">
              Product / Runtime contracts
            </p>
            <h1 className="marketing-hero-title mt-6 max-w-3xl">
              Keep the server run and React UI in sync.
            </h1>
            <p className="marketing-lede mt-7 text-white/56">
              Stream typed output, pause for human input, resume from a
              checkpoint, and keep session history without writing a second
              state model for React.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/docs/getting-started/quickstart-nextjs"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#08080c]"
              >
                Build the quickstart
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/examples"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/16 bg-white/5 px-6 text-sm font-medium text-white"
              >
                Open the refund example
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div className="absolute -inset-10 rounded-full bg-[#7657ff]/14 blur-3xl" />
            <div className="relative rotate-1 rounded-[30px] border border-white/12 bg-white/[0.05] p-3 shadow-[0_35px_90px_rgba(54,42,114,0.2)] backdrop-blur-xl">
              <div className="rounded-[22px] bg-[#101426] p-5 text-white sm:p-7">
                <div className="flex items-center justify-between font-mono text-[10px] text-white/36">
                  <span>REFUND REVIEW / RUN_81F4</span>
                  <span className="text-emerald-300">LIVE</span>
                </div>
                <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
                  {[
                    ["01", "Agent node", "check policy", "bg-[#7657ff]"],
                    ["02", "Stream", "typed decision", "bg-[#1683ff]"],
                    ["03", "React", "approve refund", "bg-[#f26b3a]"],
                  ].map(([number, label, detail, color], index) => (
                    <div key={number} className="contents">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                        <span
                          className={`grid size-7 place-items-center rounded-lg ${color} font-mono text-[10px]`}
                        >
                          {number}
                        </span>
                        <p className="mt-7 text-sm font-medium">{label}</p>
                        <p className="mt-1 font-mono text-[10px] text-white/34">
                          {detail}
                        </p>
                      </div>
                      {index < 2 ? (
                        <FlowLine
                          tone={index === 0 ? "blue" : "amber"}
                          className="mx-auto hidden h-3 w-7 sm:block"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-3 rounded-xl border border-amber-300/16 bg-amber-300/[0.045] p-3 text-xs text-white/60">
                  <Pause className="size-4 text-amber-200" />
                  The run waits here until a person approves or escalates.
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="bg-[#f8f7fb]">
        <Reveal className="marketing-container marketing-section-pad">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="font-mono text-[10px] tracking-[0.14em] text-[#6044d8] uppercase">
                The runtime lifecycle
              </p>
              <h2 className="marketing-section-title mt-5 max-w-3xl">
                Run, stream, wait, and resume against the same state.
              </h2>
            </div>
            <ArrowDown className="hidden size-7 text-[#7657ff] lg:block" />
          </div>
          <Stagger className="mt-16 border-t border-[#111426]/12">
            {lifecycle.map((item) => {
              const Icon = item.icon;
              return (
                <StaggerItem
                  as="article"
                  key={item.step}
                  className="grid gap-5 border-b border-[#111426]/12 py-7 sm:grid-cols-[4rem_4rem_0.6fr_1fr] sm:items-center"
                >
                  <span className="font-mono text-[10px] text-[#111426]/35">
                    {item.step}
                  </span>
                  <span
                    className={`grid size-11 place-items-center rounded-full ${item.color} text-white`}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <h3 className="text-2xl font-semibold tracking-[-0.03em]">
                    {item.title}
                  </h3>
                  <p className="max-w-xl text-sm leading-6 text-[#111426]/52">
                    {item.text}
                  </p>
                </StaggerItem>
              );
            })}
          </Stagger>
        </Reveal>
      </section>

      <section className="bg-[#101426] text-white">
        <Reveal className="marketing-container grid lg:grid-cols-[0.78fr_1.22fr]">
          <div className="flex flex-col justify-center bg-[#7657ff] p-8 sm:p-12 lg:p-16">
            <Braces className="size-8" />
            <p className="mt-16 font-mono text-[10px] tracking-[0.14em] text-white/65 uppercase">
              Typed output and human input
            </p>
            <h2 className="mt-5 text-balance text-4xl leading-[1.02] font-semibold tracking-[-0.05em] sm:text-5xl">
              Stream a typed decision, then ask for approval.
            </h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/72">
              Application code can own the question with useInterrupt. When the
              model should decide what to ask, the schemas can live directly in
              useReason.
            </p>
          </div>
          <div className="relative overflow-hidden p-6 sm:p-10 lg:p-14">
            <div className="absolute top-0 right-0 size-72 bg-[#1683ff]/15 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e1a] shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3 font-mono text-[10px] text-white/32">
                <span className="size-2 rounded-full bg-[#ff5f57]" />
                <span className="size-2 rounded-full bg-[#febc2e]" />
                <span className="size-2 rounded-full bg-[#28c840]" />
                <span className="ml-2">review-refund.node.ts</span>
              </div>
              <div className="p-6 sm:p-8">
                <ProductCode />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="bg-[#ebe9f3]">
        <Reveal className="marketing-container marketing-section-pad">
          <div className="grid overflow-hidden rounded-[32px] border border-[#111426]/10 bg-white lg:grid-cols-2">
            <div className="p-8 sm:p-12 lg:p-16">
              <RefreshCw className="size-7 text-[#7657ff]" />
              <p className="mt-14 font-mono text-[10px] tracking-[0.14em] text-[#6044d8] uppercase">
                Kortyx runtime state
              </p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
                Runs, checkpoints, hooks, streams, branches.
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-6 text-[#111426]/52">
                State needed to execute, pause, resume, and revisit an agent
                workflow.
              </p>
            </div>
            <div className="bg-[#111426] p-8 text-white sm:p-12 lg:p-16">
              <MessageSquareMore className="size-7 text-[#70c7ff]" />
              <p className="mt-14 font-mono text-[10px] tracking-[0.14em] text-[#70c7ff] uppercase">
                Your product state
              </p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
                Users, orders, permissions, records, interface.
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-6 text-white/52">
                Durable business data stays in the services and database your
                application already owns.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <MarketingCta />
      <MarketingFooter />
    </main>
  );
}
