"use client";

import { ArrowRight, ArrowUpRight, Github, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { DocsSearch } from "@/components/docs/docs-search";
import { Button } from "@/components/ui/button";
import type { DocsSearchEntry } from "@/lib/docs";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "./theme-toggle";

type NavbarClientProps = {
  className?: string;
  searchIndex: DocsSearchEntry[];
};

const marketingLinks = [
  { href: "/product", label: "Product" },
  { href: "/examples", label: "Examples" },
  { href: "/open-source", label: "Open source" },
  { href: "/docs", label: "Docs" },
];

export function NavbarClient({ className, searchIndex }: NavbarClientProps) {
  const pathname = usePathname();
  const isDocs = pathname?.startsWith("/docs") ?? false;
  const mobileMenuRef = useRef<HTMLDetailsElement>(null);

  return (
    <header className={cn("sticky top-0 z-50", className)}>
      <Link
        href="/docs/studio/run-locally"
        className="group block min-h-9 border-b border-violet-300/10 bg-[linear-gradient(90deg,#151026,#101321,#101026)] text-[10px] text-white/60 transition-colors hover:text-white"
      >
        <span
          className={cn(
            "flex min-h-9 items-center justify-start gap-2 py-1.5 text-left",
            isDocs
              ? "mx-auto w-full max-w-[1400px] px-4 sm:px-6"
              : "marketing-container",
          )}
        >
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

      <div
        className={cn(
          "border-b backdrop-blur-xl",
          isDocs
            ? "border-border bg-background/95"
            : "border-white/8 bg-[#08080c]/88 text-white",
        )}
      >
        <div
          className={cn(
            "flex min-h-16 items-center gap-4",
            isDocs
              ? "mx-auto w-full max-w-[1400px] px-4 sm:px-6"
              : "marketing-container",
          )}
        >
          <Link
            href="/"
            className={cn(
              "group flex min-h-10 shrink-0 items-center gap-2.5 text-sm font-semibold tracking-[-0.01em]",
              isDocs
                ? "text-foreground hover:text-muted-foreground"
                : "text-white hover:text-white/75",
            )}
          >
            <span
              className={cn(
                "grid size-8 place-items-center rounded-lg border shadow-sm transition-transform group-hover:-rotate-3",
                isDocs
                  ? "border-border bg-white dark:bg-white"
                  : "border-white/12 bg-white",
              )}
            >
              <Image src="/logo.png" alt="" width={24} height={24} priority />
            </span>
            <span className="text-[15px]">Kortyx</span>
          </Link>

          <nav className="ml-5 hidden h-16 items-center gap-1 lg:flex">
            {marketingLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative inline-flex h-full items-center px-3 text-sm transition-colors after:absolute after:right-3 after:bottom-0 after:left-3 after:h-px after:origin-center after:scale-x-0 after:bg-[#8f80ff] after:transition-transform",
                  isDocs
                    ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                    : "text-white/58 hover:text-white",
                  (pathname === link.href ||
                    (link.href !== "/docs" &&
                      pathname?.startsWith(link.href))) &&
                    (isDocs
                      ? "text-foreground after:scale-x-100"
                      : "text-white after:scale-x-100"),
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {isDocs ? (
              <DocsSearch
                entries={searchIndex}
                className="hidden w-48 sm:flex lg:w-64"
              />
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              asChild
              className={cn(
                isDocs
                  ? undefined
                  : "text-white/70 hover:bg-white/8 hover:text-white",
              )}
            >
              <a
                href="https://github.com/kortyx-io/kortyx"
                target="_blank"
                rel="noreferrer"
              >
                <Github className="size-[18px]" />
                <span className="sr-only">Open Kortyx on GitHub</span>
              </a>
            </Button>

            {isDocs ? <ThemeToggle /> : null}

            <Button
              size="sm"
              asChild
              className={cn(
                "hidden h-10 rounded-lg px-3.5 lg:inline-flex",
                !isDocs &&
                  "bg-white text-[#09090d] shadow-[0_0_0_1px_rgba(255,255,255,0.15),0_8px_28px_rgba(0,0,0,0.25)] hover:bg-white/90",
              )}
            >
              <Link href="/docs/getting-started/quickstart-nextjs">
                Start building
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>

            <details ref={mobileMenuRef} className="group relative lg:hidden">
              <summary
                className={cn(
                  "grid size-9 list-none place-items-center rounded-lg [&::-webkit-details-marker]:hidden",
                  isDocs
                    ? "text-foreground hover:bg-accent"
                    : "text-white/75 hover:bg-white/8 hover:text-white",
                )}
              >
                <Menu className="size-5" />
                <span className="sr-only">Open navigation</span>
              </summary>
              <div
                className={cn(
                  "absolute top-12 right-0 w-64 overflow-hidden rounded-2xl border p-2 shadow-2xl",
                  isDocs
                    ? "border-border bg-popover text-popover-foreground"
                    : "border-white/10 bg-[#111118] text-white",
                )}
              >
                {isDocs ? (
                  <DocsSearch entries={searchIndex} className="mb-2 w-full" />
                ) : null}
                {marketingLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => {
                      if (mobileMenuRef.current) {
                        mobileMenuRef.current.open = false;
                      }
                    }}
                    className={cn(
                      "flex min-h-11 items-center justify-between rounded-xl px-3 py-2.5 text-sm",
                      isDocs
                        ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                        : "text-white/65 hover:bg-white/6 hover:text-white",
                      (pathname === link.href ||
                        (link.href !== "/docs" &&
                          pathname?.startsWith(link.href))) &&
                        (isDocs
                          ? "bg-accent text-foreground"
                          : "bg-white/6 text-white"),
                    )}
                  >
                    {link.label}
                    <ArrowUpRight className="size-3.5 opacity-50" />
                  </Link>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}
