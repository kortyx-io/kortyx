"use client";

import { ArrowRight, ArrowUpRight, Github, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export type NavbarProps = {
  className?: string;
  /** Replace the default announcement, or pass null to hide it. */
  announcement?: ReactNode;
  /** A search trigger or another control before the common actions. */
  search?: ReactNode;
  /** Additional controls between GitHub and the common CTA. */
  actions?: ReactNode;
  /** Additional content above the links in the mobile menu. */
  mobileContent?: ReactNode;
};

const navigationLinks = [
  { href: "/product", label: "Product" },
  { href: "/examples", label: "Examples" },
  { href: "/open-source", label: "Open source" },
  { href: "/docs", label: "Docs" },
];

function StudioAnnouncement() {
  return (
    <Link
      href="/docs/studio/run-locally"
      className="group block min-h-9 border-b border-violet-300/10 bg-[linear-gradient(90deg,#151026,#101321,#101026)] text-[10px] text-white/60 transition-colors hover:text-white"
    >
      <span className="marketing-container flex min-h-9 items-center justify-start gap-2 py-1.5 text-left">
        <span className="rounded-full border border-violet-300/20 bg-violet-300/8 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-violet-200 uppercase">
          Studio preview
        </span>
        <span className="hidden sm:inline">
          Self-host observability for runs, sessions, interrupts, tokens, and
          cost.
        </span>
        <span className="sm:hidden">Self-host Studio locally.</span>
        <span className="inline-flex items-center gap-1 text-white/85">
          Run it
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </Link>
  );
}

export function Navbar({
  className,
  announcement = <StudioAnnouncement />,
  search,
  actions,
  mobileContent,
}: NavbarProps) {
  const pathname = usePathname();
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);
  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`) === true;

  useEffect(() => {
    if (pathname && mobileMenuRef.current) mobileMenuRef.current.open = false;
  }, [pathname]);

  return (
    <header className={cn("sticky top-0 z-50", className)}>
      {announcement}
      <div className="border-b border-white/8 bg-[#08080c] text-white">
        <div className="marketing-container flex min-h-16 items-center gap-4">
          <Link
            href="/"
            className="group flex min-h-10 shrink-0 items-center gap-2.5 text-sm font-semibold tracking-[-0.01em] text-white hover:text-white/75"
          >
            <span className="grid size-8 place-items-center rounded-lg border border-white/12 bg-white shadow-sm transition-transform group-hover:-rotate-3">
              <Image src="/logo.png" alt="" width={24} height={24} priority />
            </span>
            <span className="text-[15px]">Kortyx</span>
          </Link>

          <nav
            aria-label="Main navigation"
            className="ml-5 hidden h-16 items-center gap-1 lg:flex"
          >
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={
                  pathname === link.href
                    ? "page"
                    : isActive(link.href)
                      ? "true"
                      : undefined
                }
                className={cn(
                  "relative inline-flex h-full items-center px-3 text-sm text-white/58 transition-colors after:absolute after:right-3 after:bottom-0 after:left-3 after:h-px after:origin-center after:scale-x-0 after:bg-[#8f80ff] after:transition-transform hover:text-white",
                  isActive(link.href) && "text-white after:scale-x-100",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {search}
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="text-white/70 hover:bg-white/8 hover:text-white dark:hover:bg-white/8"
            >
              <a
                href="https://github.com/kortyx-io/kortyx"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="size-[18px]" />
                <span className="sr-only">Open Kortyx on GitHub</span>
              </a>
            </Button>
            {actions}
            <Button
              size="sm"
              asChild
              className="hidden h-10 rounded-lg bg-white px-3.5 text-[#09090d] shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_8px_28px_rgba(0,0,0,0.25)] hover:bg-white/90 lg:inline-flex"
            >
              <Link href="/docs/sdk/getting-started/quickstart-nextjs">
                Start building
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>

            <details
              ref={mobileMenuRef}
              className="group relative lg:hidden"
              onKeyDown={(event) => {
                if (event.key === "Escape" && mobileMenuRef.current?.open) {
                  mobileMenuRef.current.open = false;
                  mobileMenuRef.current.querySelector("summary")?.focus();
                }
              }}
            >
              <summary className="grid size-9 list-none place-items-center rounded-lg text-white/75 hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a89cff] [&::-webkit-details-marker]:hidden">
                <Menu className="size-5" />
                <span className="sr-only">Open navigation</span>
              </summary>
              <div className="absolute top-12 right-0 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#111118] p-2 text-white shadow-2xl">
                {mobileContent}
                <nav aria-label="Mobile navigation">
                  {navigationLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={
                        pathname === link.href
                          ? "page"
                          : isActive(link.href)
                            ? "true"
                            : undefined
                      }
                      onClick={() => {
                        if (mobileMenuRef.current)
                          mobileMenuRef.current.open = false;
                      }}
                      className={cn(
                        "flex min-h-11 items-center justify-between rounded-xl px-3 py-2.5 text-sm text-white/65 hover:bg-white/6 hover:text-white",
                        isActive(link.href) && "bg-white/6 text-white",
                      )}
                    >
                      {link.label}
                      <ArrowUpRight className="size-3.5 opacity-50" />
                    </Link>
                  ))}
                </nav>
              </div>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}
