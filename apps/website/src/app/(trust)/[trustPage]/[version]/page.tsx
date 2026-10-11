import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrustPage } from "@/components/trust/trust-page";
import { getWebsiteLegalReleases } from "@/lib/legal-documents";
import { getPublishedLegal } from "@/lib/legal-feed";
import { isTrustPageSlug } from "@/lib/trust";
export const dynamic = "force-dynamic";
export const dynamicParams = true;
export function generateStaticParams() {
  return getWebsiteLegalReleases().map((release) => ({
    trustPage: release.pathname.slice(1),
    version: release.version,
  }));
}
type Props = { params: Promise<{ trustPage: string; version: string }> };
async function resolve(props: Props) {
  const { trustPage, version } = await props.params;
  const published = await getPublishedLegal("website", trustPage, version);
  if (!published) notFound();
  return { trustPage, version, published };
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { trustPage, version, published } = await resolve(props);
  return {
    title: `${published.entry.title} · ${version}`,
    alternates: { canonical: `/${trustPage}/${version}` },
    robots: { index: false, follow: true },
  };
}
export default async function Page(props: Props) {
  const { trustPage, version, published } = await resolve(props);
  return (
    <TrustPage
      slug={isTrustPageSlug(trustPage) ? trustPage : "legal"}
      websiteVersion={version}
      documentProduct="website"
      cloudDocument={published.document}
      websiteRelease={published.websiteRelease}
      contentFormat={published.entry.contentFormat}
      publicationHistory={published.history}
    />
  );
}
