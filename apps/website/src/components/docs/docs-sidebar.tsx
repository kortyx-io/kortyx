import Link from "next/link";
import type { SidebarSection } from "@/lib/docs";
import { cn } from "@/lib/utils/cn";
import { DocsVersionSelector } from "./docs-version-selector";

type VersionTarget = {
  version: string;
  href: string;
  isLatest: boolean;
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocsVersionSelector
        options={versionTargets}
        selectedVersion={selectedVersion}
      />

      <nav className="mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-2">
        {sidebar.map((section) => (
          <div key={section.slug}>
            <h3 className="mb-1">
              <Link
                href={section.href}
                className={cn(
                  "text-sm font-semibold",
                  section.slug === currentSectionSlug
                    ? "text-foreground"
                    : "text-primary hover:text-primary/80",
                )}
              >
                {section.label}
              </Link>
            </h3>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = item.slug === currentDocSlug;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
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
          </div>
        ))}
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
