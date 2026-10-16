import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrustPage } from "@/components/trust/trust-page";
import { isLegalDocumentSlug } from "@/lib/legal-documents";
import { getPublishedLegal } from "@/lib/legal-feed";
import { createMarketingMetadata } from "@/lib/metadata";
import {
  getTrustPage,
  isTrustPageSlug,
  legalPublicationReady,
  trustPageSlugs,
} from "@/lib/trust";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

export function generateStaticParams() {
  return trustPageSlugs.map((trustPage) => ({ trustPage }));
}

type Props = { params: Promise<{ trustPage: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { trustPage } = await params;
  const published =
    isLegalDocumentSlug(trustPage) || !isTrustPageSlug(trustPage)
      ? await getPublishedLegal("website", trustPage)
      : null;
  if (!isTrustPageSlug(trustPage) && !published) notFound();
  const base = getTrustPage(isTrustPageSlug(trustPage) ? trustPage : "legal");
  const title =
    published?.document?.title ?? published?.websiteRelease?.content.title;
  const page = title ? { ...base, label: title, title, isLegal: true } : base;
  const pathname = `/${trustPage}`;
  return {
    ...createMarketingMetadata({
      title:
        trustPage === "about" ? "About the Kortyx Agent Framework" : page.label,
      description: page.description,
      pathname,
      imagePath: "/opengraph-image",
      imageAlt: "Kortyx, the TypeScript framework for AI agents",
      keywords: ["Kortyx", page.label],
    }),
    robots:
      page.isLegal && !legalPublicationReady
        ? { index: false, follow: true }
        : undefined,
  };
}

export default async function Page({ params }: Props) {
  const { trustPage } = await params;
  const published =
    isLegalDocumentSlug(trustPage) || !isTrustPageSlug(trustPage)
      ? await getPublishedLegal("website", trustPage)
      : null;
  if (
    (isLegalDocumentSlug(trustPage) || !isTrustPageSlug(trustPage)) &&
    !published
  )
    notFound();
  return (
    <TrustPage
      slug={isTrustPageSlug(trustPage) ? trustPage : "legal"}
      documentProduct="website"
      cloudDocument={published?.document}
      websiteRelease={published?.websiteRelease}
      contentFormat={published?.entry.contentFormat}
      publicationHistory={published?.history}
    />
  );
}
