import { ArrowUpRight, Check, CircleDashed } from "lucide-react";
import Link from "next/link";
import { PrivacySettings } from "@/components/consent/privacy-settings";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  browserStorageInventory,
  getLegalDocumentRelease,
  isLegalDocumentSlug,
} from "@/lib/legal-documents";
import { externalLinkProps } from "@/lib/links";
import {
  cloudAvailability,
  getTrustPage,
  legalPublicationReady,
  providerIdentity,
  type TrustPageSlug,
  trustContentUpdated,
  trustPageSlugs,
  trustPages,
} from "@/lib/trust";

const linkClass =
  "inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#d3cbff] underline decoration-[#a89cff]/40 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a89cff]";

function OperatorDetails() {
  const details = [
    ["Product brand", providerIdentity.brand],
    ["Current operator", providerIdentity.operatorName],
    ["Business contact address", providerIdentity.contactAddress],
    ["Private contact email", providerIdentity.contactEmail],
    ["Registration number", providerIdentity.registrationNumber],
    ["Tax number", providerIdentity.taxNumber],
  ].filter(([, value]) => Boolean(value));

  return (
    <dl className="mt-6 divide-y divide-white/12 rounded-xl border border-white/15 px-5">
      {details.map(([label, value]) => (
        <div key={label} className="grid gap-2 py-4 sm:grid-cols-[12rem_1fr]">
          <dt className="text-sm text-[#b8b5c9]">{label}</dt>
          <dd className="text-sm font-medium text-white">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StorageInventory() {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-white/15">
      <table className="w-full min-w-[35rem] text-left text-sm">
        <caption className="sr-only">
          Current website browser storage inventory
        </caption>
        <thead className="bg-white/5 text-white">
          <tr>
            {["Storage", "Purpose", "Duration"].map((label) => (
              <th key={label} scope="col" className="px-5 py-4 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/12 text-[#c9c6d6]">
          {browserStorageInventory.map((item) => (
            <tr key={item.key}>
              <th scope="row" className="px-5 py-4 font-normal">
                <code>{item.key}</code>
                <br />
                {item.mechanism}
              </th>
              <td className="px-5 py-4">{item.purpose}</td>
              <td className="px-5 py-4">{item.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrustPage({ slug }: { slug: TrustPageSlug }) {
  const page = getTrustPage(slug);
  const release = isLegalDocumentSlug(slug)
    ? getLegalDocumentRelease(slug)
    : null;

  return (
    <MarketingShell className="marketing-page min-h-screen bg-[#08080c] text-white">
      <section className="border-b border-white/12 bg-[radial-gradient(ellipse_at_80%_0%,rgba(143,128,255,0.14),transparent_65%)]">
        <div className="marketing-container py-16 sm:py-24">
          <p className="font-mono text-xs tracking-[0.14em] text-[#c9c1ff] uppercase">
            {page.eyebrow}
          </p>
          <h1 className="mt-6 max-w-4xl text-4xl leading-[1.12] font-semibold tracking-[-0.04em] sm:text-6xl">
            {page.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[#c9c6d6]">
            {page.description}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-[#b8b5c9]">
            <span className="inline-flex items-center gap-2">
              <Check className="size-4 text-[#78e0bd]" aria-hidden="true" />
              Framework available
            </span>
            <span className="inline-flex items-center gap-2">
              <CircleDashed
                className="size-4 text-[#c9c1ff]"
                aria-hidden="true"
              />
              Cloud · {cloudAvailability.toLowerCase()}
            </span>
          </div>
        </div>
      </section>

      <div className="marketing-container grid gap-12 py-12 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16 lg:py-16">
        <aside>
          <nav
            aria-label="Company and trust"
            className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:sticky lg:top-32 lg:grid-cols-1"
          >
            {trustPageSlugs.map((item) => (
              <Link
                key={item}
                href={`/${item}`}
                aria-current={slug === item ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#a89cff] ${slug === item ? "bg-[#a89cff]/12 text-[#ded8ff]" : "text-[#b8b5c9] hover:bg-white/5 hover:text-white"}`}
              >
                {trustPages[item].label}
              </Link>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 max-w-4xl">
          {page.isLegal && !legalPublicationReady ? (
            <div
              role="note"
              className="mb-10 rounded-xl border border-[#eac47c]/30 bg-[#eac47c]/8 p-5 text-sm leading-6 text-[#f2dba9]"
            >
              <p className="font-semibold">Draft for review</p>
              <p className="mt-2">
                Publication review covers verified operator details, private
                contact information, and deployment-specific data practices.
              </p>
            </div>
          ) : null}

          {page.cards ? (
            <div className="mb-12 grid gap-4 sm:grid-cols-2">
              {page.cards.map((card) => (
                <Link
                  key={card.title}
                  href={card.href}
                  {...externalLinkProps(card.href)}
                  className="group rounded-2xl border border-white/15 bg-white/3 p-6 hover:border-[#a89cff]/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a89cff]"
                >
                  <p className="font-mono text-[11px] tracking-wider text-[#c9c1ff] uppercase">
                    {card.label}
                  </p>
                  <h2 className="mt-4 text-xl leading-7 font-medium">
                    {card.title}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#c9c6d6]">
                    {card.description}
                  </p>
                  <ArrowUpRight
                    className="mt-5 size-5 text-[#c9c1ff]"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          ) : null}

          <nav
            aria-label="On this page"
            className="mb-10 flex flex-wrap gap-x-5 gap-y-2 border-y border-white/12 py-4"
          >
            {page.sections.map((section) => (
              <Link
                key={section.id}
                href={`#${section.id}`}
                className={linkClass}
              >
                {section.title}
              </Link>
            ))}
          </nav>

          <div className="space-y-12">
            {page.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-32"
              >
                <h2 className="text-2xl leading-8 font-semibold tracking-tight">
                  {section.title}
                </h2>
                <div className="mt-5 space-y-4 text-base leading-8 text-[#c9c6d6]">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {slug === "legal" && section.id === "operator" ? (
                  <OperatorDetails />
                ) : null}
                {slug === "cookies" && section.id === "current-use" ? (
                  <StorageInventory />
                ) : null}
                {slug === "cookies" && section.id === "controls" ? (
                  <PrivacySettings className={`${linkClass} mt-4`} />
                ) : null}
                {section.links ? (
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                    {section.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        {...externalLinkProps(link.href)}
                        className={linkClass}
                      >
                        {link.label}
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
          <div className="mt-12 border-t border-white/12 pt-6 text-xs leading-6 text-[#b8b5c9]">
            <p>
              {page.isLegal ? "Draft revision" : "Last updated"}:{" "}
              <time dateTime={trustContentUpdated}>4 October 2026</time>
            </p>
            {release ? (
              <p>Document version: {release.version} · Draft release</p>
            ) : null}
          </div>
        </article>
      </div>
    </MarketingShell>
  );
}
