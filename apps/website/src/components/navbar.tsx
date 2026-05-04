import Link from "next/link";
import { DocsSearch } from "@/components/docs/docs-search";
import { getDocsSearchIndex } from "@/lib/docs";
import { cn } from "@/lib/utils/cn";
import { GithubLink } from "./github-link";
import { ThemeToggle } from "./theme-toggle";

type NavbarProps = {
  className?: string;
};

export async function Navbar({ className }: NavbarProps) {
  const searchIndex = await getDocsSearchIndex();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border bg-background",
        className,
      )}
    >
      <div className="mx-auto flex min-h-14 w-full max-w-[1400px] flex-wrap items-center gap-3 px-4 py-2 sm:flex-nowrap sm:px-6">
        <nav className="flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-semibold text-foreground hover:text-muted-foreground"
          >
            Kortyx
          </Link>
          <Link
            href="/docs"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Docs
          </Link>
        </nav>
        <div className="order-3 flex w-full items-center gap-1 sm:order-0 sm:ml-auto sm:w-auto">
          <DocsSearch
            entries={searchIndex}
            className="w-full sm:w-64 lg:w-48"
          />
          <GithubLink />
          <ThemeToggle className="ml-auto sm:ml-0" />
        </div>
      </div>
    </header>
  );
}
