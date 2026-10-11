import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrustPage } from "@/components/trust/trust-page";
import {
  cloudLegalSlugs,
  cloudLegalUrls,
  getCloudLegalDocuments,
} from "@/lib/cloud-legal";
import { getPublishedLegal } from "@/lib/legal-feed";
export const dynamic = "force-dynamic";
export const dynamicParams = true;
export function generateStaticParams() {
  return [
    ...cloudLegalSlugs.map((document) => ({ document, version: [] })),
    ...getCloudLegalDocuments().map(({ slug, version }) => ({
      document: slug,
      version: [version],
    })),
  ];
}
type Props = { params: Promise<{ document: string; version?: string[] }> };
async function resolveDocument({ params }: Props) {
  const { document: slug, version } = await params;
  if ((version?.length ?? 0) > 1) notFound();
  const published = await getPublishedLegal("cloud", slug, version?.[0]);
  if (!published?.document) notFound();
  return { document: published.document, version, published };
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { document, version } = await resolveDocument(props);
  const urls = cloudLegalUrls(document.slug, document.version);
  return {
    title: `${document.title} · ${document.version}`,
    description:
      "Legal information for hosted Kortyx Cloud. View this document and its publication history.",
    alternates: {
      canonical: version?.length ? urls.versionUrl : urls.canonicalUrl,
    },
    robots: { index: false, follow: true },
  };
}
export default async function Page(props: Props) {
  const { document, published } = await resolveDocument(props);
  return (
    <TrustPage
      slug="terms"
      cloudDocument={document}
      contentFormat={published.entry.contentFormat}
      publicationHistory={published.history}
    />
  );
}
