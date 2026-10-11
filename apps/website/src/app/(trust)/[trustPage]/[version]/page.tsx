import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrustPage } from "@/components/trust/trust-page";
import {
  getLegalDocumentRelease,
  getWebsiteLegalReleases,
  isLegalDocumentSlug,
} from "@/lib/legal-documents";
export const dynamicParams = false;
export function generateStaticParams() {
  return getWebsiteLegalReleases().map((release) => ({
    trustPage: release.pathname.slice(1),
    version: release.version,
  }));
}
type Props = { params: Promise<{ trustPage: string; version: string }> };
async function resolve(props: Props) {
  const { trustPage, version } = await props.params;
  if (!isLegalDocumentSlug(trustPage)) notFound();
  if (
    !getWebsiteLegalReleases().some(
      (item) => item.pathname === `/${trustPage}` && item.version === version,
    )
  )
    notFound();
  return {
    trustPage,
    version,
    release: getLegalDocumentRelease(trustPage, version),
  };
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { trustPage, version, release } = await resolve(props);
  return {
    title: `${release.content.title} · ${version}`,
    alternates: { canonical: `/${trustPage}/${version}` },
    robots: { index: false, follow: true },
  };
}
export default async function Page(props: Props) {
  const { trustPage, version } = await resolve(props);
  return <TrustPage slug={trustPage} websiteVersion={version} />;
}
