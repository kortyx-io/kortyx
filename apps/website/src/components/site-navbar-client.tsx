"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { ThemeToggle } from "@/components/theme-toggle";

const DocsSearch = dynamic(() =>
  import("@/components/docs/docs-search").then((module) => module.DocsSearch),
);

/** Route composition supplies controls; Navbar owns the shared layout. */
export function SiteNavbarClient() {
  const pathname = usePathname();
  const isDocs = pathname === "/docs" || pathname?.startsWith("/docs/");
  const isNestedDocs = pathname?.startsWith("/docs/") ?? false;

  return (
    <Navbar
      maxWidth={isNestedDocs ? 1400 : undefined}
      containerClassName={
        isNestedDocs ? "mx-auto w-full px-4 sm:px-6" : undefined
      }
      search={
        isDocs ? (
          <DocsSearch className="w-9 border-white/15 bg-white/5 text-white/65 hover:border-[#a89cff]/60 hover:text-white sm:w-48 lg:w-64 [&_kbd]:border-white/15 [&_kbd]:bg-white/5 [&_kbd]:text-white/65" />
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
