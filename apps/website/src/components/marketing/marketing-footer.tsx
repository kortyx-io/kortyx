import Image from "next/image";
import Link from "next/link";

const footerLinks = [
  ["Product", "/product"],
  ["Examples", "/examples"],
  ["Open source", "/open-source"],
  ["Documentation", "/docs"],
  ["Studio setup", "/docs/studio/run-locally"],
  ["GitHub", "https://github.com/kortyx-io/kortyx"],
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/8 bg-[#07070a] text-white">
      <div className="marketing-container grid gap-10 py-10 md:grid-cols-[1fr_auto]">
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
          <p className="mt-4 max-w-md text-sm leading-6 text-white/32">
            TypeScript workflows, persisted runs, human approval, and React
            state for agent applications.
          </p>
        </div>
        <nav
          aria-label="Footer navigation"
          className="grid grid-cols-2 gap-x-14 gap-y-3 text-sm sm:grid-cols-3"
        >
          {footerLinks.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="inline-flex min-h-9 items-center text-white/38 hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/8">
        <div className="marketing-container flex flex-col gap-2 py-5 font-mono text-[10px] tracking-[0.08em] text-white/20 uppercase sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Kortyx</span>
          <span>Framework Apache-2.0 · Studio ELv2</span>
        </div>
      </div>
    </footer>
  );
}
