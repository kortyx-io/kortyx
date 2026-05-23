import { ImageResponse } from "next/og";
import { type DocRecord, resolveDocsRoute } from "@/lib/docs";
import { getOgLogoDataUri } from "@/lib/og-assets";
import { KortyxOgCard, openGraphImageSize } from "@/lib/og-card";

type DocsImageRouteParams = {
  slug?: string[];
};

function normalizeImageSlug(slug: string[] | undefined): string[] {
  const segments = slug ?? [];
  const lastSegment = segments.at(-1);
  if (!lastSegment?.endsWith(".png")) return segments;

  return [...segments.slice(0, -1), lastSegment.slice(0, -4)].filter(Boolean);
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

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<DocsImageRouteParams>;
  },
) {
  const routeParams = await params;
  const resolved = await resolveDocsRoute(normalizeImageSlug(routeParams.slug));
  const logoSrc = await getOgLogoDataUri();

  if (!resolved) {
    return new ImageResponse(
      <KortyxOgCard
        eyebrow="Documentation"
        title="Kortyx Docs"
        description="Documentation and developer guides for Kortyx."
        logoSrc={logoSrc}
      />,
      openGraphImageSize,
    );
  }

  if (resolved.routeKind === "section") {
    const section = resolved.versionDocs.sections.find(
      (entry) => entry.slug === resolved.sectionSlug,
    );
    const sectionTitle = section?.label ?? "Kortyx Docs";
    const sectionDocs = getSectionDocs(
      resolved.versionDocs.docs,
      resolved.sectionSlug,
    );

    return new ImageResponse(
      <KortyxOgCard
        eyebrow="Kortyx Docs"
        title={sectionTitle}
        description={getSectionDescription(sectionTitle, sectionDocs)}
        logoSrc={logoSrc}
      />,
      openGraphImageSize,
    );
  }

  const sectionTitle =
    resolved.versionDocs.sections.find(
      (entry) => entry.slug === resolved.doc.slugSegments[0],
    )?.label ?? "Kortyx Docs";

  return new ImageResponse(
    <KortyxOgCard
      eyebrow={sectionTitle}
      title={resolved.doc.frontmatter.title}
      description={resolved.doc.frontmatter.description}
      logoSrc={logoSrc}
    />,
    openGraphImageSize,
  );
}
