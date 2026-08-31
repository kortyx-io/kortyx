import {
  ArrowRight,
  type Check,
  GitFork,
  PackageCheck,
  Pause,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FlowLine } from "@/components/marketing/flow-line";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingPageJsonLd } from "@/components/marketing/marketing-page-json-ld";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/reveal";
import { createMarketingMetadata } from "@/lib/metadata";

const pageTitle = "AI Agent Workflow Examples";
const pageDescription =
  "Follow a Kortyx refund workflow from tool calls and typed reasoning to human approval, resumed execution, and React interface state.";

export const metadata: Metadata = createMarketingMetadata({
  title: pageTitle,
  description: pageDescription,
  pathname: "/examples",
  imagePath: "/examples/opengraph-image",
  imageAlt: "Kortyx agent workflow examples",
  keywords: [
    "AI agent workflow example",
    "TypeScript agent example",
    "human approval workflow",
    "agent workflow React",
    "structured AI output",
    "Kortyx examples",
  ],
});

const steps = [
  [
    "01",
    "Find the order",
    "A tool loads order #4831 from the application service.",
    "#7657ff",
  ],
  [
    "02",
    "Check policy",
    "A focused node compares delivery date, condition, and return rules.",
    "#1683ff",
  ],
  [
    "03",
    "Draft decision",
    "useReason streams a schema-validated recommendation into React.",
    "#eb5b8c",
  ],
  [
    "04",
    "Ask a person",
    "The run checkpoints before money moves or product data changes.",
    "#f28b36",
  ],
  [
    "05",
    "Resume and refund",
    "The approved run continues once and records the final outcome.",
    "#16a87c",
  ],
] as const;

function ExampleCode() {
  return (
    <pre className="overflow-x-auto font-mono text-[11px] leading-6 sm:text-xs">
      <code>
        <span className="text-[#77819b]">{"// approve-refund.node.ts\n"}</span>
        <span className="text-[#d78cff]">{"const "}</span>
        <span className="text-white">{"action "}</span>
        <span className="text-[#d78cff]">{"= await "}</span>
        <span className="text-[#70c7ff]">{"useInterrupt"}</span>
        <span className="text-white">{"({\n"}</span>
        <span className="text-[#97a2ba]">{"  id: "}</span>
        <span className="text-[#81e6b8]">{'"refund-approval"'}</span>
        <span className="text-white">{",\n"}</span>
        <span className="text-[#97a2ba]">{"  request: {\n"}</span>
        <span className="text-[#ffce71]">{'    kind: "choice",\n'}</span>
        <span className="text-[#81e6b8]">
          {'    question: "Issue the $84 refund?",\n'}
        </span>
        <span className="text-[#97a2ba]">
          {"    options: [approve, escalate],\n"}
        </span>
        <span className="text-[#97a2ba]">{"  },\n"}</span>
        <span className="text-white">{"});\n\n"}</span>
        <span className="text-[#d78cff]">{"return "}</span>
        <span className="text-white">{"{\n"}</span>
        <span className="text-[#97a2ba]">{"  condition: action,\n"}</span>
        <span className="text-[#97a2ba]">
          {"  data: { orderId, action },\n"}
        </span>
        <span className="text-white">{"};"}</span>
      </code>
    </pre>
  );
}

export default function ExamplesPage() {
  return (
    <main className="marketing-page min-h-screen overflow-hidden bg-[#f4f3f8] text-[#111426]">
      <MarketingPageJsonLd
        name={pageTitle}
        description={pageDescription}
        pathname="/examples"
      />
      <section className="relative border-b border-white/8 bg-[#08080c] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(118,87,255,0.18),transparent_25%),radial-gradient(circle_at_86%_20%,rgba(22,131,255,0.14),transparent_28%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:auto,auto,48px_48px,48px_48px]" />
        <Reveal className="marketing-container marketing-hero-pad relative grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full border border-white/12 bg-white/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-white/65 uppercase">
              Everyday workflow / Refund review
            </span>
            <h1 className="marketing-hero-title mt-7">
              An agent recommends. A person decides.
            </h1>
            <p className="marketing-lede mt-7 text-white/56">
              A support agent loads order #4831, checks the return policy,
              streams a typed recommendation, and waits for approval before it
              issues the refund.
            </p>
            <Link
              href="/docs/guides/interrupts-and-resume"
              className="group mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#08080c]"
            >
              Read interrupts and resume
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="relative mx-auto w-full max-w-3xl">
            <div className="absolute -inset-6 rotate-2 rounded-[36px] bg-[#f28b36]/18" />
            <div className="relative -rotate-1 overflow-hidden rounded-[30px] border border-white/12 bg-[#fbfaff] text-[#111426] shadow-[0_35px_90px_rgba(54,42,114,0.25)]">
              <div className="flex items-center justify-between border-b border-[#111426]/9 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold">Refund request #4831</p>
                  <p className="mt-1 font-mono text-[10px] text-[#111426]/38">
                    MAYA LOPEZ · 12 DAYS SINCE DELIVERY
                  </p>
                </div>
                <span className="rounded-full bg-[#f28b36]/12 px-2.5 py-1 font-mono text-[10px] font-semibold text-[#9b4d0d]">
                  NEEDS APPROVAL
                </span>
              </div>
              <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
                <div className="border-b border-[#111426]/9 bg-[#efedf5] p-5 lg:border-r lg:border-b-0">
                  <p className="font-mono text-[10px] text-[#111426]/38 uppercase">
                    Customer message
                  </p>
                  <p className="mt-4 text-sm leading-6 text-[#111426]/72">
                    “I received the US keyboard layout instead of the Spanish
                    one. The box is still sealed. Can I get a refund?”
                  </p>
                  <div className="mt-6 space-y-2 text-xs">
                    <div className="flex justify-between border-t border-[#111426]/9 pt-3">
                      <span className="text-[#111426]/42">Order total</span>
                      <span className="font-semibold">$84.00</span>
                    </div>
                    <div className="flex justify-between border-t border-[#111426]/9 pt-3">
                      <span className="text-[#111426]/42">Condition</span>
                      <span className="font-semibold">Unopened</span>
                    </div>
                  </div>
                </div>
                <div className="relative p-5 sm:p-6">
                  <FlowLine className="absolute top-9 -left-8 hidden h-3 w-14 lg:block" />
                  <div className="flex items-center gap-2 text-[10px] font-medium text-[#7657ff]">
                    <Sparkles className="size-4" /> Agent recommendation
                  </div>
                  <p className="mt-4 text-lg font-semibold">
                    Eligible for a full refund
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#111426]/54">
                    The request is inside the 30-day window and the item is
                    unopened. Refund to the original payment method.
                  </p>
                  <div className="mt-6 rounded-2xl border border-[#f28b36]/24 bg-[#fff6ec] p-4">
                    <p className="text-sm font-semibold">
                      Issue $84.00 refund?
                    </p>
                    <div className="mt-4 flex gap-2">
                      <span className="rounded-full bg-[#111426] px-4 py-2 text-[10px] font-semibold text-white">
                        Approve
                      </span>
                      <span className="rounded-full border border-[#111426]/12 px-4 py-2 text-[10px]">
                        Escalate
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="bg-[#10121b] text-white">
        <Reveal className="marketing-container marketing-section-pad">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] tracking-[0.14em] text-[#a89cff] uppercase">
              What happens in the runtime
            </p>
            <h2 className="marketing-section-title mt-5">
              A refund passes through five named steps.
            </h2>
          </div>
          <div className="relative mt-16">
            <div className="absolute top-0 bottom-0 -left-[5px] w-3 lg:hidden">
              <FlowLine orientation="vertical" className="size-full" />
            </div>
            <div className="absolute -top-[6px] right-0 left-0 hidden h-3 lg:block">
              <FlowLine className="size-full" />
            </div>
            <Stagger className="grid gap-0 lg:grid-cols-5">
              {steps.map(([number, title, text, color], index) => (
                <StaggerItem
                  as="article"
                  key={number}
                  className="relative py-6 pl-6 lg:min-h-[300px] lg:px-5 lg:pt-8"
                >
                  <span
                    className="absolute top-8 -left-[7px] size-3 rounded-full border-2 border-[#10121b] lg:-top-[7px] lg:left-5"
                    style={{ backgroundColor: color }}
                  />
                  <p className="font-mono text-[10px] text-white/30">
                    {number}
                  </p>
                  <h3 className="mt-12 text-xl font-semibold lg:mt-16">
                    {title}
                  </h3>
                  <p className="mt-4 text-sm leading-6 text-white/42">{text}</p>
                  {index < steps.length - 1 ? (
                    <ArrowRight className="absolute top-[-8px] right-3 hidden size-4 text-white/16 lg:block" />
                  ) : null}
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </Reveal>
      </section>

      <section className="bg-[#ebe9f3]">
        <Reveal className="marketing-container grid lg:grid-cols-[0.82fr_1.18fr]">
          <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-16">
            <Pause className="size-8 text-[#7657ff]" />
            <p className="mt-16 font-mono text-[10px] tracking-[0.14em] text-[#5941bf] uppercase">
              Human input in one node
            </p>
            <h2 className="marketing-section-title mt-5">
              The external write happens after approval.
            </h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-[#111426]/56">
              Resume replays node code from a checkpoint. Keep side effects
              after the interrupt or protect them with an idempotency key.
              useInterrupt marks that checkpoint in the node.
            </p>
          </div>
          <div className="bg-[#0d1120] p-6 text-white sm:p-10 lg:p-14">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#090c16] shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/8 px-5 py-3 font-mono text-[10px] text-white/32">
                <span className="size-2 rounded-full bg-[#ff5f57]" />
                <span className="size-2 rounded-full bg-[#febc2e]" />
                <span className="size-2 rounded-full bg-[#28c840]" />
                <span className="ml-2">approve-refund.node.ts</span>
              </div>
              <div className="p-6 sm:p-8">
                <ExampleCode />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="bg-[#f8f7fb]">
        <Reveal className="marketing-container marketing-section-pad">
          <div className="grid gap-12 lg:grid-cols-[0.68fr_1.32fr] lg:gap-20">
            <div>
              <p className="font-mono text-[10px] tracking-[0.14em] text-[#9b4d0d] uppercase">
                Runtime events in the interface
              </p>
              <h2 className="marketing-section-title mt-5">
                React renders the state of the active run.
              </h2>
            </div>
            <Stagger className="divide-y divide-[#111426]/10 border-y border-[#111426]/10">
              {[
                [
                  Search,
                  "Tools",
                  "Load the order through request-scoped tools or an application service.",
                ],
                [
                  ShieldCheck,
                  "Typed output",
                  "Validate the recommendation before it appears as product state.",
                ],
                [
                  Pause,
                  "Interrupts",
                  "Tie the approval control to the exact checkpoint and request.",
                ],
                [
                  PackageCheck,
                  "Side effects",
                  "Issue the refund after the resumed run reaches the write node.",
                ],
                [
                  GitFork,
                  "Session history",
                  "Rollback and fork the server workflow together with the visible messages.",
                ],
              ].map(([Icon, title, text]) => {
                const RowIcon = Icon as typeof Check;
                return (
                  <StaggerItem
                    as="article"
                    key={String(title)}
                    className="grid gap-4 py-5 sm:grid-cols-[3rem_10rem_1fr] sm:items-center"
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-[#ebe9f3] text-[#7657ff]">
                      <RowIcon className="size-[18px]" />
                    </span>
                    <h3 className="font-semibold">{String(title)}</h3>
                    <p className="text-sm leading-6 text-[#111426]/52">
                      {String(text)}
                    </p>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </div>
        </Reveal>
      </section>

      <section className="bg-[#7657ff] text-white">
        <Reveal className="marketing-container flex flex-col gap-8 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[0.14em] text-white/60 uppercase">
              Larger open-source example
            </p>
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Canvas adds custom pickers, structured editors, and routing across
              several workflows.
            </h2>
          </div>
          <a
            href="https://github.com/kortyx-io/kortyx/tree/main/examples/kortyx-canvas"
            target="_blank"
            rel="noreferrer"
            className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#111426]"
          >
            Browse Canvas source
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </Reveal>
      </section>

      <MarketingCta
        title="Replace the refund policy with one of your own."
        description="Connect your services to the same workflow, interrupt, and resume APIs used in this example."
      />
      <MarketingFooter />
    </main>
  );
}
