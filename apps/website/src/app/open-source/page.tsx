import {
  ArrowRight,
  Check,
  Cloud,
  Code2,
  Eye,
  Github,
  PackageOpen,
  Server,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FlowLine } from "@/components/marketing/flow-line";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingPageJsonLd } from "@/components/marketing/marketing-page-json-ld";
import { Reveal, Stagger, StaggerItem } from "@/components/marketing/reveal";
import { createMarketingMetadata } from "@/lib/metadata";

const pageTitle = "Open-source TypeScript Agent Framework";
const pageDescription =
  "Run Kortyx on your infrastructure with an Apache-2.0 framework, optional self-hosted Studio, and no required cloud execution path.";

export const metadata: Metadata = createMarketingMetadata({
  title: pageTitle,
  description: pageDescription,
  pathname: "/open-source",
  imagePath: "/open-source/opengraph-image",
  imageAlt: "Kortyx open-source TypeScript agent framework",
  keywords: [
    "open source agent framework",
    "TypeScript AI framework",
    "self-hosted agent runtime",
    "Apache 2 agent framework",
    "self-hosted AI observability",
    "Kortyx open source",
  ],
});

const packages = [
  ["kortyx", "Apache-2.0", "workflow runtime · hooks · persistence · CLI"],
  [
    "@kortyx/react",
    "Apache-2.0",
    "chat state · transports · storage · interrupts",
  ],
  [
    "@kortyx/* providers",
    "Apache-2.0",
    "OpenAI · Anthropic · Google · Groq · Mistral",
  ],
  ["@kortyx/otel", "Apache-2.0", "OpenTelemetry spans · normalized attributes"],
] as const;

function TerminalHero() {
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#a89cff]/18 bg-[#08080c] shadow-[0_35px_100px_rgba(0,0,0,0.55)]">
      <div className="flex items-center gap-2 border-b border-[#a89cff]/12 px-5 py-3 font-mono text-[10px] text-[#a89cff]/42">
        <span className="size-2 rounded-full bg-[#ff5f57]" />
        <span className="size-2 rounded-full bg-[#febc2e]" />
        <span className="size-2 rounded-full bg-[#28c840]" />
        <span className="ml-2">kortyx / local application</span>
      </div>
      <div className="space-y-7 p-6 font-mono text-xs sm:p-8">
        <div>
          <span className="text-[#78e0bd]">$</span>{" "}
          <span className="text-white/82">pnpm add kortyx @kortyx/google</span>
        </div>
        <div className="space-y-2 text-[11px]">
          <p className="text-white/30">resolved 72 packages</p>
          <p>
            <span className="text-[#78e0bd]">+</span>{" "}
            <span className="text-white/72">kortyx 0.14.0</span>
          </p>
          <p>
            <span className="text-[#78e0bd]">+</span>{" "}
            <span className="text-white/72">@kortyx/google 0.5.0</span>
          </p>
        </div>
        <FlowLine tone="green" className="h-3 w-full" />
        <div className="border-t border-[#a89cff]/10 pt-6">
          <p className="text-[#a89cff]/58"># no cloud account required</p>
          <p className="mt-2 text-white/78">
            Your server · your database · your keys
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OpenSourcePage() {
  return (
    <main className="marketing-page min-h-screen overflow-hidden bg-[#08080c] text-white">
      <MarketingPageJsonLd
        name={pageTitle}
        description={pageDescription}
        pathname="/open-source"
      />
      <section className="relative border-b border-[#a89cff]/12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(118,87,255,0.13),transparent_30%),linear-gradient(rgba(168,156,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(168,156,255,0.035)_1px,transparent_1px)] bg-[size:auto,40px_40px,40px_40px]" />
        <Reveal className="marketing-container marketing-hero-pad relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#a89cff]/20 bg-[#a89cff]/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-[#c9c1ff] uppercase">
              <span className="size-1.5 rounded-full bg-[#78e0bd]" /> Open
              source framework
            </div>
            <h1 className="marketing-hero-title mt-7 max-w-3xl">
              Run Kortyx inside your own application.
            </h1>
            <p className="marketing-lede mt-7 text-white/50">
              The agent runtime does not require a Kortyx account or hosted
              control plane. Model keys, workflow execution, and product data
              stay in your application.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="https://github.com/kortyx-io/kortyx"
                target="_blank"
                rel="noreferrer"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#a89cff] px-5 text-sm font-semibold text-[#08080c]"
              >
                <Github className="size-4" /> View source
              </a>
              <Link
                href="/docs/getting-started/installation"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-[#a89cff]/20 bg-[#a89cff]/5 px-5 text-sm text-[#dcd7ff]"
              >
                Installation guide
              </Link>
            </div>
          </div>
          <TerminalHero />
        </Reveal>
      </section>

      <section className="bg-[#f4f3f8] text-[#111426]">
        <Reveal className="marketing-container marketing-section-pad">
          <div className="grid gap-12 lg:grid-cols-[0.62fr_1.38fr] lg:gap-20">
            <div>
              <p className="font-mono text-[10px] tracking-[0.14em] text-[#6044d8] uppercase">
                Package manifest
              </p>
              <h2 className="marketing-section-title mt-5">
                Install the runtime first. Add React or telemetry when needed.
              </h2>
              <p className="mt-6 text-base leading-7 text-[#111426]/56">
                Begin with the runtime and one model provider. React and
                telemetry are separate packages because not every deployment
                needs the same shape.
              </p>
            </div>
            <Stagger className="border-y border-[#111426]/14">
              {packages.map(([name, license, detail], index) => (
                <StaggerItem
                  key={name}
                  className="grid gap-3 border-[#111426]/12 py-5 sm:grid-cols-[11rem_8rem_1fr] sm:items-center"
                  style={{ borderTopWidth: index === 0 ? 0 : 1 }}
                >
                  <code className="font-mono text-xs font-semibold text-[#6044d8]">
                    {name}
                  </code>
                  <span className="font-mono text-[10px] text-[#111426]/38">
                    {license}
                  </span>
                  <p className="text-sm leading-6 text-[#111426]/54">
                    {detail}
                  </p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </Reveal>
      </section>

      <section className="bg-[#10121b]">
        <Reveal className="marketing-container marketing-section-pad">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div>
              <p className="font-mono text-[10px] tracking-[0.14em] text-[#a89cff] uppercase">
                Availability
              </p>
              <h2 className="marketing-section-title mt-5 max-w-3xl">
                Current availability across Kortyx.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-white/42">
              The framework is open source today. Studio is a self-hosted
              preview. Cloud is still in development.
            </p>
          </div>
          <Stagger className="mt-16 grid gap-0 border-y border-[#a89cff]/14 lg:grid-cols-3">
            {[
              [
                PackageOpen,
                "01",
                "Framework",
                "Available now",
                "Apache-2.0",
                "Runtime, React client, providers, persistence, telemetry contracts, and CLI.",
              ],
              [
                Eye,
                "02",
                "Studio",
                "Self-hosted preview",
                "ELv2",
                "Workflow catalog and observability for real runs, sessions, interrupts, tokens, and cost.",
              ],
              [
                Cloud,
                "03",
                "Cloud",
                "In development",
                "Not announced",
                "Cloud is in development as a managed way to operate Studio.",
              ],
            ].map(
              ([Icon, number, name, status, license, description], index) => {
                const StatusIcon = Icon as typeof Server;
                return (
                  <StaggerItem
                    as="article"
                    key={String(number)}
                    className="border-[#a89cff]/14 py-8 lg:min-h-[390px] lg:px-8"
                    style={{ borderLeftWidth: index === 0 ? 0 : 1 }}
                  >
                    <div className="flex items-center justify-between">
                      <StatusIcon className="size-6 text-[#a89cff]" />
                      <span className="font-mono text-[10px] text-white/24">
                        {String(number)}
                      </span>
                    </div>
                    <p className="mt-16 font-mono text-[10px] tracking-[0.1em] text-[#a89cff]/64 uppercase">
                      {String(status)}
                    </p>
                    <h3 className="mt-3 text-3xl font-semibold">
                      {String(name)}
                    </h3>
                    <p className="mt-5 max-w-sm text-sm leading-6 text-white/42">
                      {String(description)}
                    </p>
                    <p className="mt-10 font-mono text-[10px] text-white/28">
                      {String(license)}
                    </p>
                  </StaggerItem>
                );
              },
            )}
          </Stagger>
        </Reveal>
      </section>

      <section className="bg-[#ebe9f3] text-[#111426]">
        <Reveal className="marketing-container marketing-section-pad grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:items-center lg:gap-20">
          <div>
            <p className="font-mono text-[10px] tracking-[0.14em] text-[#6044d8] uppercase">
              Execution boundary
            </p>
            <h2 className="marketing-section-title mt-5">
              The open-source runtime does not depend on Kortyx Cloud.
            </h2>
          </div>
          <Stagger className="grid gap-px overflow-hidden rounded-2xl bg-[#111426]/16 sm:grid-cols-2">
            {[
              "Provider credentials stay on your server",
              "Product data stays in your database",
              "OpenTelemetry exports to your backend",
              "Studio stays outside the execution path",
            ].map((item) => (
              <StaggerItem
                key={item}
                className="flex min-h-28 items-center gap-3 bg-[#f8f7fb] p-5 text-sm font-medium"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#111426] text-[#a89cff]">
                  <Check className="size-3.5" />
                </span>
                {item}
              </StaggerItem>
            ))}
          </Stagger>
        </Reveal>
      </section>

      <section className="bg-[#f4f3f8] text-[#111426]">
        <Reveal className="marketing-container marketing-section-pad grid gap-5 lg:grid-cols-2">
          <a
            href="https://github.com/kortyx-io/kortyx"
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-72 flex-col justify-between rounded-[28px] border border-[#111426]/12 bg-white p-8 transition-transform hover:-translate-y-1 sm:p-10"
          >
            <Code2 className="size-7 text-[#6044d8]" />
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">
                Read the implementation.
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-6 text-[#111426]/52">
                Framework packages, tests, documentation, Studio, and complete
                Next.js examples live in the repository.
              </p>
              <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold">
                Browse GitHub
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </a>
          <Link
            href="/docs/studio/run-locally"
            className="group flex min-h-72 flex-col justify-between rounded-[28px] bg-[#111426] p-8 text-white transition-transform hover:-translate-y-1 sm:p-10"
          >
            <Server className="size-7 text-[#a89cff]" />
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">
                Run Studio locally.
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-6 text-white/48">
                Publish declared workflow topology and inspect telemetry from
                requests handled by your application.
              </p>
              <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#dcd7ff]">
                Open the guide
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        </Reveal>
      </section>

      <MarketingCta
        title="Install Kortyx without creating a cloud account."
        description="The quickstart runs the workflow inside your application with your model keys and database."
      />
      <MarketingFooter />
    </main>
  );
}
