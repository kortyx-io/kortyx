import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
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
  type DocRecord,
  generateDocsStaticParams,
  getDocByVersionAndSlug,
  getDocsVersions,
  getLatestDocsVersion,
  getVersionSidebar,
  resolveDocsRoute,
} from "@/lib/docs";
import { getLatestDocsVersionDisplay } from "@/lib/docs/config";
import { getDocLastUpdatedMeta } from "@/lib/docs/last-updated";
import { siteConfig } from "@/lib/site";
import { extractToc } from "@/lib/utils/extract-toc";

type DocsRouteParams = {
  slug?: string[];
};

type BreadcrumbItem = {
  label: string;
  href: string;
};

const docsMetadataKeywords = [
  "Kortyx",
  "Kortyx documentation",
  "AI agents",
  "TypeScript AI framework",
  "LLM workflows",
  "streaming AI",
  "agent runtime",
];
function absoluteUrl(pathname: string): string {
  return new URL(pathname, siteConfig.url).toString();
}

function getDocsOgImagePath(canonicalPath: string): string {
  const slugPath = canonicalPath.replace(/^\/docs\/?/, "").replace(/\/$/, "");
  return slugPath ? `/og/docs/${slugPath}.png` : "/opengraph-image";
}

function getSocialImage(canonicalPath: string) {
  return {
    url: getDocsOgImagePath(canonicalPath),
    width: 1200,
    height: 630,
    alt: "Kortyx documentation",
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function toIsoDate(value: string | null): string | undefined {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function getSectionDocs(docs: DocRecord[], sectionSlug: string): DocRecord[] {
  return docs.filter((entry) => entry.slugSegments[0] === sectionSlug);
}

function getSectionDescription(
  sectionTitle: string,
  sectionDocs: DocRecord[],
): string {
  const docTitles = sectionDocs
    .map((doc) => doc.frontmatter.title)
    .filter(Boolean)
    .slice(0, 4);

  if (docTitles.length === 0) {
    return `Browse Kortyx documentation for ${sectionTitle}.`;
  }

  return `Learn ${sectionTitle} in Kortyx, including ${docTitles.join(", ")}.`;
}

function stringifyJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(items.at(-1)?.href ?? "/docs")}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: absoluteUrl(item.href),
    })),
  };
}

function buildDocsJsonLd(args: {
  breadcrumbs: BreadcrumbItem[];
  canonicalPath: string;
  title: string;
  description: string;
  sectionTitle: string | null;
  keywords: string[];
  doc: DocRecord | null;
  sectionItems: Array<{ href: string; title: string; description: string }>;
  modifiedTime: string | undefined;
  editOnGithubHref: string | null;
  imagePath: string;
}) {
  const url = absoluteUrl(args.canonicalPath);
  const websiteId = `${siteConfig.url}/#website`;
  const organizationId = `${siteConfig.url}/#organization`;
  const softwareId = `${siteConfig.url}/#software`;
  const sourceCodeId = `${siteConfig.repositoryUrl}#source-code`;
  const breadcrumbId = `${url}#breadcrumb`;
  const pageId = `${url}#webpage`;
  const articleId = `${url}#article`;
  const imageUrl = absoluteUrl(args.imagePath);

  const pageSchema =
    args.doc === null
      ? {
          "@type": "CollectionPage",
          "@id": pageId,
          url,
          name: args.title,
          description: args.description,
          image: imageUrl,
          isPartOf: { "@id": websiteId },
          about: { "@id": softwareId },
          breadcrumb: { "@id": breadcrumbId },
          inLanguage: "en",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: args.sectionItems.map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              url: absoluteUrl(item.href),
              name: item.title,
              description: item.description,
            })),
          },
        }
      : {
          "@type": "TechArticle",
          "@id": articleId,
          url,
          mainEntityOfPage: { "@id": pageId },
          headline: args.doc.frontmatter.title,
          name: args.title,
          description: args.description,
          image: imageUrl,
          articleSection: args.sectionTitle ?? "Kortyx Docs",
          keywords: args.keywords,
          dateModified: args.modifiedTime,
          author: { "@id": organizationId },
          publisher: { "@id": organizationId },
          isPartOf: { "@id": websiteId },
          about: { "@id": softwareId },
          inLanguage: "en",
          isBasedOn: args.editOnGithubHref ?? undefined,
          wordCount: args.doc.content.split(/\s+/).filter(Boolean).length,
        };
  const webPageSchema =
    args.doc === null
      ? null
      : {
          "@type": "WebPage",
          "@id": pageId,
          url,
          name: args.title,
          description: args.description,
          primaryImageOfPage: imageUrl,
          isPartOf: { "@id": websiteId },
          about: { "@id": softwareId },
          breadcrumb: { "@id": breadcrumbId },
          mainEntity: { "@id": articleId },
          inLanguage: "en",
        };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: siteConfig.name,
        url: siteConfig.url,
        sameAs: siteConfig.sameAs,
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: siteConfig.name,
        url: siteConfig.url,
        publisher: { "@id": organizationId },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": softwareId,
        name: siteConfig.name,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Cross-platform",
        url: siteConfig.url,
        softwareHelp: { "@id": websiteId },
        subjectOf: { "@id": sourceCodeId },
        publisher: { "@id": organizationId },
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": sourceCodeId,
        name: `${siteConfig.name} source code`,
        codeRepository: siteConfig.repositoryUrl,
        programmingLanguage: "TypeScript",
        publisher: { "@id": organizationId },
      },
      buildBreadcrumbJsonLd(args.breadcrumbs),
      ...(webPageSchema ? [webPageSchema] : []),
      pageSchema,
    ],
  };
}

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
    const sectionDocs = getSectionDocs(
      resolved.versionDocs.docs,
      resolved.sectionSlug,
    );
    const sectionDescription = getSectionDescription(sectionTitle, sectionDocs);
    const title = `${sectionTitle} | Kortyx Docs`;
    const url = absoluteUrl(resolved.canonicalPath);
    const socialImage = getSocialImage(resolved.canonicalPath);
    const keywords = uniqueStrings([
      ...docsMetadataKeywords,
      sectionTitle,
      ...sectionDocs.flatMap((doc) => [
        doc.frontmatter.title,
        doc.frontmatter.sidebarLabel,
        ...doc.frontmatter.keywords,
      ]),
    ]);

    return {
      title,
      description: sectionDescription,
      keywords,
      applicationName: "Kortyx",
      authors: [{ name: "Kortyx" }],
      creator: "Kortyx",
      publisher: "Kortyx",
      category: "Developer Documentation",
      alternates: {
        canonical: resolved.canonicalPath,
      },
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      },
      openGraph: {
        title,
        description: sectionDescription,
        type: "website",
        url,
        siteName: "Kortyx",
        locale: "en_US",
        images: [socialImage],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: sectionDescription,
        images: [socialImage.url],
      },
    };
  }

  const title = `${resolved.doc.frontmatter.title} | Kortyx Docs`;
  const url = absoluteUrl(resolved.canonicalPath);
  const socialImage = getSocialImage(resolved.canonicalPath);
  const sectionTitle =
    resolved.versionDocs.sections.find(
      (entry) => entry.slug === resolved.doc.slugSegments[0],
    )?.label ?? "Kortyx Docs";
  const lastUpdatedMeta = await getDocLastUpdatedMeta(
    `${resolved.doc.version}/${resolved.doc.relativeFile}`,
  );
  const modifiedTime = toIsoDate(lastUpdatedMeta.updatedAt);
  const keywords = uniqueStrings([
    ...docsMetadataKeywords,
    sectionTitle,
    resolved.doc.frontmatter.title,
    resolved.doc.frontmatter.sidebarLabel,
    ...resolved.doc.frontmatter.keywords,
  ]);

  return {
    title,
    description: resolved.doc.frontmatter.description,
    keywords,
    applicationName: "Kortyx",
    authors: [{ name: "Kortyx" }],
    creator: "Kortyx",
    publisher: "Kortyx",
    category: "Developer Documentation",
    alternates: {
      canonical: resolved.canonicalPath,
      types: {
        "text/markdown": `${resolved.canonicalPath}.md`,
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      title,
      description: resolved.doc.frontmatter.description,
      type: "article",
      url,
      siteName: "Kortyx",
      locale: "en_US",
      modifiedTime,
      authors: ["Kortyx"],
      section: sectionTitle,
      tags: keywords,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: resolved.doc.frontmatter.description,
      images: [socialImage.url],
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
  if (resolved.redirectTo) permanentRedirect(resolved.redirectTo);

  const versions = await getDocsVersions();
  const latestVersion = await getLatestDocsVersion();
  const latestVersionDisplay = await getLatestDocsVersionDisplay();
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
  const hasDistinctDocBreadcrumb =
    Boolean(isDocRoute && currentDoc && currentDocHref) &&
    currentDocHref !== currentSection?.href;

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
    ...(hasDistinctDocBreadcrumb && currentDoc && currentDocHref
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
          label:
            version === latestVersion
              ? latestVersionDisplay.label
              : `Version ${version}`,
          subtitle:
            version === latestVersion ? latestVersionDisplay.subtitle : version,
        };
      }

      const sameDoc = await getDocByVersionAndSlug(version, currentDoc.slug);
      return {
        version,
        href: sameDoc
          ? buildDocHref(version, currentDoc.slugSegments)
          : buildDocHref(version, []),
        isLatest: version === latestVersion,
        label:
          version === latestVersion
            ? latestVersionDisplay.label
            : `Version ${version}`,
        subtitle:
          version === latestVersion ? latestVersionDisplay.subtitle : version,
      };
    }),
  );

  const toc = isDocRoute && currentDoc ? extractToc(currentDoc.content) : [];
  const lastUpdatedMeta =
    isDocRoute && currentDoc
      ? await getDocLastUpdatedMeta(
          `${currentDoc.version}/${currentDoc.relativeFile}`,
        )
      : null;
  const pageTitle =
    isDocRoute && currentDoc
      ? `${currentDoc.frontmatter.title} | Kortyx Docs`
      : `${currentSection?.label ?? "Section"} | Kortyx Docs`;
  const sectionDocs =
    !isDocRoute && currentSectionSlug
      ? getSectionDocs(resolved.versionDocs.docs, currentSectionSlug)
      : [];
  const pageDescription =
    isDocRoute && currentDoc
      ? currentDoc.frontmatter.description
      : getSectionDescription(currentSection?.label ?? "Section", sectionDocs);
  const sectionTitle = currentSection?.label ?? null;
  const pageKeywords = uniqueStrings([
    ...docsMetadataKeywords,
    sectionTitle,
    ...(currentDoc
      ? [
          currentDoc.frontmatter.title,
          currentDoc.frontmatter.sidebarLabel,
          ...currentDoc.frontmatter.keywords,
        ]
      : sectionDocs.flatMap((doc) => [
          doc.frontmatter.title,
          doc.frontmatter.sidebarLabel,
          ...doc.frontmatter.keywords,
        ])),
  ]);
  const docsJsonLd = buildDocsJsonLd({
    breadcrumbs,
    canonicalPath: resolved.canonicalPath,
    title: pageTitle,
    description: pageDescription,
    sectionTitle,
    keywords: pageKeywords,
    doc: currentDoc,
    sectionItems,
    modifiedTime: toIsoDate(lastUpdatedMeta?.updatedAt ?? null),
    editOnGithubHref,
    imagePath: getDocsOgImagePath(resolved.canonicalPath),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be rendered as a script tag for crawlers.
        dangerouslySetInnerHTML={{ __html: stringifyJsonLd(docsJsonLd) }}
      />
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
                  lastUpdatedAt={lastUpdatedMeta?.updatedAt ?? null}
                  lastUpdatedReferenceAt={lastUpdatedMeta?.generatedAt ?? null}
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
