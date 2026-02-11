import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DocsArticleNavigation } from "@/components/docs/docs-article-navigation";
import { DocsBreadcrumbs } from "@/components/docs/docs-breadcrumbs";
import { DocsMarkdownContent } from "@/components/docs/docs-markdown-content";
import { DocsMobileSidebar } from "@/components/docs/docs-mobile-sidebar";
import { DocsPageActions } from "@/components/docs/docs-page-actions";
import { DocsRightRail } from "@/components/docs/docs-right-rail";
import { DocsSectionGrid } from "@/components/docs/docs-section-grid";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import {
  buildDocHref,
  generateDocsStaticParams,
  getDocByVersionAndSlug,
  getDocsVersions,
  getLatestDocsVersion,
  getVersionSidebar,
  resolveDocsRoute,
} from "@/lib/docs";
import { extractToc } from "@/lib/utils/extract-toc";

type DocsRouteParams = {
  slug?: string[];
};

export const dynamicParams = false;

export async function generateStaticParams(): Promise<DocsRouteParams[]> {
  return generateDocsStaticParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<DocsRouteParams>;
}): Promise<Metadata> {
  const routeParams = await params;
  const slug = routeParams.slug ?? [];
  const resolved = await resolveDocsRoute(slug);

  if (!resolved) {
    return {
      title: "Docs | Kortyx",
      description: "Kortyx documentation",
    };
  }

  if (resolved.routeKind === "section") {
    const section = resolved.versionDocs.sections.find(
      (entry) => entry.slug === resolved.sectionSlug,
    );
    const sectionTitle = section?.label ?? "Section";
    const sectionDocs = resolved.versionDocs.docs.filter(
      (entry) => entry.slugSegments[0] === resolved.sectionSlug,
    );
    const sectionDescription =
      sectionDocs[0]?.frontmatter.description ??
      `Browse docs in ${sectionTitle}.`;

    return {
      title: `${sectionTitle} | Kortyx Docs`,
      description: sectionDescription,
      alternates: {
        canonical: resolved.canonicalPath,
      },
      openGraph: {
        title: `${sectionTitle} | Kortyx Docs`,
        description: sectionDescription,
        type: "website",
        url: resolved.canonicalPath,
      },
      twitter: {
        card: "summary_large_image",
        title: `${sectionTitle} | Kortyx Docs`,
        description: sectionDescription,
      },
    };
  }

  const title = `${resolved.doc.frontmatter.title} | Kortyx Docs`;
  return {
    title,
    description: resolved.doc.frontmatter.description,
    keywords: resolved.doc.frontmatter.keywords,
    alternates: {
      canonical: resolved.canonicalPath,
    },
    openGraph: {
      title,
      description: resolved.doc.frontmatter.description,
      type: "article",
      url: resolved.canonicalPath,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: resolved.doc.frontmatter.description,
    },
  };
}

export default async function DocsPage({
  params,
}: {
  params: Promise<DocsRouteParams>;
}) {
  const routeParams = await params;
  const slug = routeParams.slug ?? [];
  const resolved = await resolveDocsRoute(slug);

  if (!resolved) notFound();
  if (resolved.redirectTo) redirect(resolved.redirectTo);

  const versions = await getDocsVersions();
  const latestVersion = await getLatestDocsVersion();
  const sidebar = await getVersionSidebar(resolved.requestedVersion);
  const isDocRoute = resolved.routeKind === "doc";
  const currentDoc = resolved.routeKind === "doc" ? resolved.doc : null;
  const currentSectionSlug = isDocRoute
    ? (currentDoc?.slugSegments[0] ?? null)
    : resolved.sectionSlug;
  const currentSection = currentSectionSlug
    ? sidebar.find((section) => section.slug === currentSectionSlug)
    : null;
  const sectionItems = currentSection?.items ?? [];

  const orderedNavItems = sidebar.flatMap((section) => section.items);
  const currentNavIndex =
    isDocRoute && currentDoc
      ? orderedNavItems.findIndex((item) => item.slug === currentDoc.slug)
      : -1;
  const previousItem =
    currentNavIndex > 0 ? orderedNavItems[currentNavIndex - 1] : null;
  const nextItem =
    currentNavIndex >= 0 && currentNavIndex < orderedNavItems.length - 1
      ? orderedNavItems[currentNavIndex + 1]
      : null;

  const currentDocHref =
    isDocRoute && currentDoc
      ? buildDocHref(resolved.requestedVersion, currentDoc.slugSegments)
      : null;
  const markdownHref = isDocRoute ? `${resolved.canonicalPath}.md` : null;

  const breadcrumbs = [
    { label: "Docs", href: buildDocHref(resolved.requestedVersion, []) },
    ...(currentSection
      ? [
          {
            label: currentSection.label,
            href: currentSection.href,
          },
        ]
      : []),
    ...(isDocRoute && currentDoc && currentDocHref
      ? [
          {
            label: currentDoc.frontmatter.sidebarLabel,
            href: currentDocHref,
          },
        ]
      : []),
  ];

  const docsEditBaseUrl =
    process.env.NEXT_PUBLIC_DOCS_EDIT_BASE_URL ??
    "https://github.com/kortyx-io/kortyx/blob/main";
  const docsSourcePath =
    isDocRoute && currentDoc
      ? `apps/website/src/docs/${currentDoc.version}/${currentDoc.relativeFile}`
      : null;
  const editOnGithubHref =
    docsEditBaseUrl && docsSourcePath
      ? `${docsEditBaseUrl}/${docsSourcePath}`
      : null;

  const versionTargets = await Promise.all(
    versions.map(async (version) => {
      if (!isDocRoute || !currentDoc || !currentSectionSlug) {
        const versionSidebar = await getVersionSidebar(version);
        const sameSection = versionSidebar.find(
          (section) => section.slug === currentSectionSlug,
        );
        return {
          version,
          href: sameSection ? sameSection.href : buildDocHref(version, []),
          isLatest: version === latestVersion,
        };
      }

      const sameDoc = await getDocByVersionAndSlug(version, currentDoc.slug);
      return {
        version,
        href: sameDoc
          ? buildDocHref(version, currentDoc.slugSegments)
          : buildDocHref(version, []),
        isLatest: version === latestVersion,
      };
    }),
  );

  const toc = isDocRoute && currentDoc ? extractToc(currentDoc.content) : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-x-8 px-4 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_220px]">
        <DocsSidebar
          sidebar={sidebar}
          currentSectionSlug={currentSectionSlug}
          currentDocSlug={currentDoc?.slug ?? null}
          versionTargets={versionTargets}
          selectedVersion={resolved.requestedVersion}
        />

        <main className="min-w-0 py-8">
          <div className="mb-8 flex max-w-3xl flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <DocsMobileSidebar
                sidebar={sidebar}
                currentSectionSlug={currentSectionSlug}
                currentDocSlug={currentDoc?.slug ?? null}
                versionTargets={versionTargets}
                selectedVersion={resolved.requestedVersion}
              />
              <DocsBreadcrumbs items={breadcrumbs} />
            </div>
            {isDocRoute && markdownHref ? (
              <DocsPageActions
                canonicalPath={resolved.canonicalPath}
                markdownPath={markdownHref}
              />
            ) : null}
          </div>

          {isDocRoute && currentDoc ? (
            <>
              <article className="max-w-3xl space-y-5 pb-20">
                <DocsMarkdownContent
                  content={currentDoc.content}
                  version={resolved.requestedVersion}
                  currentRelativeFile={currentDoc.relativeFile}
                  versionDocs={resolved.versionDocs}
                />
              </article>

              <DocsArticleNavigation
                previousItem={previousItem}
                nextItem={nextItem}
              />
            </>
          ) : (
            <DocsSectionGrid
              title={currentSection?.label ?? "Section"}
              items={sectionItems}
            />
          )}
        </main>

        {isDocRoute && currentDoc ? (
          <DocsRightRail
            description={currentDoc.frontmatter.description}
            toc={toc}
            editOnGithubHref={editOnGithubHref}
          />
        ) : null}
      </div>
    </div>
  );
}
