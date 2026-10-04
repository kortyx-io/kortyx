"use client";

import { usePathname } from "next/navigation";
import { DocsSearch } from "@/components/docs/docs-search";
import { Navbar } from "@/components/navbar";
import { ThemeToggle } from "@/components/theme-toggle";
import type { DocsSearchEntry } from "@/lib/docs";

/** Route composition supplies controls; Navbar owns the shared layout. */
export function SiteNavbarClient({
  searchIndex,
}: {
  searchIndex: DocsSearchEntry[];
}) {
  const pathname = usePathname();
  const isDocs = pathname === "/docs" || pathname?.startsWith("/docs/");

  return (
    <Navbar
      search={
        isDocs ? (
          <DocsSearch
            entries={searchIndex}
            className="w-9 border-white/15 bg-white/5 text-white/65 hover:border-[#a89cff]/60 hover:text-white sm:w-48 lg:w-64 [&_kbd]:border-white/15 [&_kbd]:bg-white/5 [&_kbd]:text-white/65"
          />
        ) : null
      }
      actions={
        isDocs ? (
          <ThemeToggle className="text-white/70 hover:bg-white/8 hover:text-white dark:hover:bg-white/8" />
        ) : null
      }
    />
  );
}
