import Image from "next/image";
import Link from "next/link";
import { PrivacySettings } from "@/components/consent/privacy-settings";
import { externalLinkProps } from "@/lib/links";

const footerGroups = [
  {
    title: "Build",
    links: [
      ["Product", "/product"],
      ["Examples", "/examples"],
      ["Open source", "/open-source"],
      ["Documentation", "/docs"],
      ["Studio setup", "/docs/studio/run-locally"],
      ["GitHub", "https://github.com/kortyx-io/kortyx"],
    ],
  },
  {
    title: "Kortyx",
    links: [
      ["About", "/about"],
      ["Contact", "/contact"],
      ["Security & Data", "/security"],
      ["Releases", "https://github.com/kortyx-io/kortyx/releases"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy", "/privacy"],
      ["Website Terms", "/terms"],
      ["Cookies & Storage", "/cookies"],
      ["Legal information", "/legal"],
    ],
  },
] as const;

const footerLinkClass =
  "inline-flex min-h-11 items-center text-sm text-[#b8b5c9] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a89cff]";

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/8 bg-[#07070a] text-white">
      <div className="marketing-container grid gap-10 py-12 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-2.5 text-sm font-semibold"
          >
            <span className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white">
              <Image src="/logo.png" alt="" width={24} height={24} />
            </span>
            Kortyx
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#b8b5c9]">
            TypeScript workflows, persisted runs, human approval, and React
            state for agent applications.
          </p>
        </div>
        <nav
          aria-label="Footer navigation"
          className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3"
        >
          {footerGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-xs font-semibold tracking-wider text-white uppercase">
                {group.title}
              </p>
              <ul>
                {group.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      {...externalLinkProps(href)}
                      className={footerLinkClass}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
                {group.title === "Legal" ? (
                  <li>
                    <PrivacySettings className={footerLinkClass} />
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/8">
        <div className="marketing-container flex flex-col gap-2 py-5 font-mono text-[10px] tracking-[0.08em] text-[#b8b5c9] uppercase sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Kortyx</span>
          <span>Framework Apache-2.0 · Studio ELv2</span>
        </div>
      </div>
    </footer>
  );
}
