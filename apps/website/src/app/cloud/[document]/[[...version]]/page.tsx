import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrustPage } from "@/components/trust/trust-page";
import {
  cloudLegalSlugs,
  cloudLegalUrls,
  getCloudLegalDocument,
  getCloudLegalDocuments,
  isCloudLegalSlug,
} from "@/lib/cloud-legal";
export const dynamicParams = false;
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
  if (!isCloudLegalSlug(slug) || (version?.length ?? 0) > 1) notFound();
  const document = getCloudLegalDocument(slug, version?.[0]);
  if (!document) notFound();
  return { document, version };
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { document, version } = await resolveDocument(props);
  const urls = cloudLegalUrls(document.slug, document.version);
  return {
    title: `${document.title} · ${document.version}`,
    description:
      "Kortyx Cloud staging draft. Not production-approved. Exact versioned document; viewing does not record acceptance.",
    alternates: {
      canonical: version?.length ? urls.versionUrl : urls.canonicalUrl,
    },
    robots: { index: false, follow: true },
  };
}
export default async function Page(props: Props) {
  const { document } = await resolveDocument(props);
  return <TrustPage slug="terms" cloudDocument={document} />;
}
