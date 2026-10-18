import { ChevronDown } from "lucide-react";
import Link from "next/link";

export function formatLegalDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

export function LegalDocumentHeader({
  title,
  description,
  scope,
  updatedAt,
}: {
  title: string;
  description: string;
  scope: string;
  updatedAt: string;
}) {
  return (
    <header className="border-b border-white/12">
      <div className="marketing-container py-12 sm:py-16">
        <p className="font-mono text-xs tracking-[0.12em] text-[#c9c1ff] uppercase">
          Legal · {scope}
        </p>
        <h1 className="mt-5 max-w-4xl text-4xl leading-tight font-semibold tracking-[-0.04em] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#c9c6d6] sm:text-lg">
          {description}
        </p>
        <p className="mt-6 text-sm text-[#b8b5c9]">
          Updated <time dateTime={updatedAt}>{formatLegalDate(updatedAt)}</time>
        </p>
      </div>
    </header>
  );
}

export function DocumentContents({
  sections,
}: {
  sections: { id: string; title: string }[];
}) {
  return (
    <details className="group mb-10 rounded-xl border border-white/12 bg-white/[0.02]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 focus-visible:outline-2 focus-visible:outline-[#a89cff] [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium text-white">Contents</span>
        <span className="flex items-center gap-3 text-xs text-[#b8b5c9]">
          {sections.length} sections
          <ChevronDown
            className="size-4 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>
      <nav aria-label="On this page" className="border-t border-white/12 p-3">
        <ol className="grid gap-1 sm:grid-cols-2">
          {sections.map((section, index) => (
            <li key={section.id}>
              <Link
                href={`#${section.id}`}
                className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm leading-6 text-[#c9c6d6] hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-[#a89cff]"
              >
                <span
                  className="font-mono text-xs text-[#8e8a9e]"
                  aria-hidden="true"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                {section.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}

const footerLink =
  "inline-flex min-h-11 items-center text-sm text-[#c9c1ff] underline decoration-[#a89cff]/30 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-[#a89cff]";

export function LegalDocumentFooter({
  scope,
  updatedAt,
  version,
  currentUrl,
  versionUrl,
  contentUrl,
  hash,
  history,
}: {
  scope: string;
  updatedAt: string;
  version: string;
  currentUrl: string;
  versionUrl: string;
  contentUrl?: string;
  hash: string;
  history: { version: string; url: string; date: string }[];
}) {
  return (
    <footer className="mt-14 border-t border-white/12 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-sm text-[#b8b5c9]">
          {scope} · Updated{" "}
          <time dateTime={updatedAt}>{formatLegalDate(updatedAt)}</time>
        </p>
        <div className="flex gap-6">
          <Link className={footerLink} href={currentUrl}>
            Current version
          </Link>
          <Link className={footerLink} href={versionUrl}>
            Permanent link
          </Link>
        </div>
      </div>
      <details className="group mt-4 rounded-xl border border-white/12">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm text-[#b8b5c9] focus-visible:outline-2 focus-visible:outline-[#a89cff] [&::-webkit-details-marker]:hidden">
          Version history & verification
          <ChevronDown
            className="size-4 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="space-y-5 border-t border-white/12 p-4 text-xs leading-6 text-[#b8b5c9]">
          <dl className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <dt>Version</dt>
            <dd className="break-all font-mono">{version}</dd>
            <dt>Content hash</dt>
            <dd className="break-all font-mono">SHA-256 · {hash}</dd>
          </dl>
          {contentUrl ? (
            <a className={footerLink} href={contentUrl}>
              View source document (JSON)
            </a>
          ) : null}
          <nav aria-label="Document history">
            <ul className="divide-y divide-white/10">
              {history.map((release) => (
                <li key={release.version}>
                  <Link
                    className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded px-2 py-2 text-[#c9c1ff] hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#a89cff]"
                    href={release.url}
                    aria-current={
                      release.version === version ? "page" : undefined
                    }
                  >
                    <time dateTime={release.date}>
                      {formatLegalDate(release.date)}
                    </time>
                    <span className="break-all font-mono text-xs">
                      {release.version}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </details>
      {scope === "Kortyx Cloud" ? (
        <p className="mt-4 text-xs leading-6 text-[#8e8a9e]">
          Cloud Terms are accepted in your account. Reading this page does not
          record acceptance.
        </p>
      ) : null}
    </footer>
  );
}
