import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrustPage } from "@/components/trust/trust-page";
import { siteConfig } from "@/lib/site";
import {
  getTrustPage,
  isTrustPageSlug,
  legalPublicationReady,
  trustPageSlugs,
} from "@/lib/trust";

export const dynamicParams = false;

export function generateStaticParams() {
  return trustPageSlugs.map((trustPage) => ({ trustPage }));
}

type Props = { params: Promise<{ trustPage: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { trustPage } = await params;
  if (!isTrustPageSlug(trustPage)) notFound();
  const page = getTrustPage(trustPage);
  const pathname = `/${trustPage}`;
  return {
    title: page.label,
    description: page.description,
    alternates: { canonical: pathname },
    robots:
      page.isLegal && !legalPublicationReady
        ? { index: false, follow: true }
        : undefined,
    openGraph: {
      title: `${page.label} | Kortyx`,
      description: page.description,
      url: new URL(pathname, siteConfig.url).toString(),
    },
  };
}

export default async function Page({ params }: Props) {
  const { trustPage } = await params;
  if (!isTrustPageSlug(trustPage)) notFound();
  return <TrustPage slug={trustPage} />;
}
