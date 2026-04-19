"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { SidebarSection } from "@/lib/docs";
import { cn } from "@/lib/utils/cn";
import { DocsVersionSelector } from "./docs-version-selector";

type VersionTarget = {
  version: string;
  href: string;
  isLatest: boolean;
  label: string;
  subtitle: string;
};

type DocsSidebarProps = {
  sidebar: SidebarSection[];
  currentSectionSlug: string | null;
  currentDocSlug: string | null;
  versionTargets: VersionTarget[];
  selectedVersion: string;
};

export function DocsSidebarContent(props: DocsSidebarProps) {
  const {
    sidebar,
    currentSectionSlug,
    currentDocSlug,
    versionTargets,
    selectedVersion,
  } = props;
  const navRef = useRef<HTMLElement | null>(null);
  const scrollStorageKey = useMemo(
    () => `docs-sidebar-scroll:${selectedVersion}`,
    [selectedVersion],
  );
  const collapseStorageKey = useMemo(
    () => `docs-sidebar-collapsed:${selectedVersion}`,
    [selectedVersion],
  );
  const defaultOpenSections = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    for (const section of sidebar) {
      defaults[section.slug] =
        !section.collapsed || section.slug === currentSectionSlug;
    }
    return defaults;
  }, [sidebar, currentSectionSlug]);
  const [openSections, setOpenSections] =
    useState<Record<string, boolean>>(defaultOpenSections);
  const loadedCollapsibleState = useRef(false);

  const persistSidebarScroll = () => {
    const navElement = navRef.current;
    if (!navElement) return;
    sessionStorage.setItem(scrollStorageKey, String(navElement.scrollTop));
  };

  useEffect(() => {
    const navElement = navRef.current;
    if (!navElement) return;

    const storedValue = sessionStorage.getItem(scrollStorageKey);
    const parsed = Number(storedValue);
    if (Number.isFinite(parsed)) {
      navElement.scrollTop = parsed;
    }
  }, [scrollStorageKey]);

  useEffect(() => {
    const storedValue = sessionStorage.getItem(collapseStorageKey);
    let storedState: Record<string, boolean> = {};
    if (storedValue) {
      try {
        const parsed = JSON.parse(storedValue) as Record<string, boolean>;
        if (parsed && typeof parsed === "object") {
          storedState = parsed;
        }
      } catch {
        storedState = {};
      }
    }

    const merged = {
      ...defaultOpenSections,
      ...storedState,
    };
    if (currentSectionSlug) merged[currentSectionSlug] = true;

    setOpenSections(merged);
    loadedCollapsibleState.current = true;
  }, [collapseStorageKey, currentSectionSlug, defaultOpenSections]);

  useEffect(() => {
    if (!loadedCollapsibleState.current) return;
    sessionStorage.setItem(collapseStorageKey, JSON.stringify(openSections));
  }, [collapseStorageKey, openSections]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocsVersionSelector
        options={versionTargets}
        selectedVersion={selectedVersion}
      />

      <nav
        ref={navRef}
        onScroll={persistSidebarScroll}
        className="docs-sidebar-scroll mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-2"
      >
        {sidebar.map((section) => {
          const isOpen =
            openSections[section.slug] ??
            (!section.collapsed || section.slug === currentSectionSlug);

          return (
            <Collapsible
              key={section.slug}
              open={isOpen}
              onOpenChange={(nextOpen) => {
                setOpenSections((previous) => ({
                  ...previous,
                  [section.slug]: nextOpen,
                }));
                persistSidebarScroll();
              }}
            >
              <div className="mb-1 flex items-center gap-1">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={`Toggle ${section.label}`}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isOpen ? "rotate-0" : "-rotate-90",
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <Link
                  href={section.href}
                  onClick={persistSidebarScroll}
                  className={cn(
                    "text-sm font-semibold",
                    section.slug === currentSectionSlug
                      ? "text-foreground"
                      : "text-primary hover:text-primary/80 dark:text-blue-300 dark:hover:text-blue-200",
                  )}
                >
                  {section.label}
                </Link>
              </div>
              <CollapsibleContent>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = item.slug === currentDocSlug;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={persistSidebarScroll}
                          className={cn(
                            "block rounded px-2 py-1 text-sm",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {item.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </nav>
    </div>
  );
}

export function DocsSidebar(props: DocsSidebarProps) {
  return (
    <aside className="hidden md:block md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] py-8">
      <DocsSidebarContent {...props} />
    </aside>
  );
}
