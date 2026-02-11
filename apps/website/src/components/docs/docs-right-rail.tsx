import { ExternalLinkIcon } from "@/components/icons/external-link-icon";
import type { TocHeading } from "@/lib/utils/extract-toc";
import { DocsOnThisPage } from "./docs-on-this-page";
import { ScrollToTopButton } from "./scroll-to-top-button";

type DocsRightRailProps = {
  description: string;
  toc: TocHeading[];
  editOnGithubHref?: string | null;
};

export function DocsRightRail(props: DocsRightRailProps) {
  const { description, toc, editOnGithubHref } = props;

  return (
    <aside className="hidden xl:block xl:sticky xl:top-14 xl:h-[calc(100vh-3.5rem)]">
      <div className="h-full overflow-y-auto py-8 pl-4">
        {description ? (
          <p className="mb-6 text-sm leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          On this page
        </h2>
        <DocsOnThisPage items={toc} />

        {editOnGithubHref ? (
          <div className="mt-4 border-t border-border pt-4">
            <a
              href={editOnGithubHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-primary"
            >
              Edit this page on GitHub
              <ExternalLinkIcon className="h-4 w-4" aria-hidden="true" />
            </a>

            <div className="mt-2">
              <ScrollToTopButton variant="circle" />
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
