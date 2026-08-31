import type { Metadata } from "next";
import { siteConfig } from "@/lib/site";

type MarketingMetadata = {
  description: string;
  imageAlt: string;
  imagePath: string;
  keywords: string[];
  pathname: string;
  title: string;
};

export function createMarketingMetadata({
  description,
  imageAlt,
  imagePath,
  keywords,
  pathname,
  title,
}: MarketingMetadata): Metadata {
  const socialTitle = `${title} | ${siteConfig.name}`;
  const url = new URL(pathname, siteConfig.url).toString();

  return {
    title,
    description,
    keywords,
    category: "Developer Tools",
    alternates: { canonical: pathname },
    openGraph: {
      title: socialTitle,
      description,
      type: "website",
      url,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      images: [
        {
          url: imagePath,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      creator: siteConfig.twitterHandle,
      images: [imagePath],
    },
  };
}
