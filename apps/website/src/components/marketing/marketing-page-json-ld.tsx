import { siteConfig } from "@/lib/site";

export function MarketingPageJsonLd({
  description,
  name,
  pathname,
}: {
  description: string;
  name: string;
  pathname: string;
}) {
  const url = new URL(pathname, siteConfig.url).toString();
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteConfig.url}/#organization`,
        name: siteConfig.name,
        url: siteConfig.url,
        sameAs: siteConfig.sameAs,
      },
      {
        "@type": "WebSite",
        "@id": `${siteConfig.url}/#website`,
        name: siteConfig.name,
        url: siteConfig.url,
        publisher: { "@id": `${siteConfig.url}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteConfig.url}/#software`,
        name: siteConfig.name,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Cross-platform",
        url: siteConfig.url,
        codeRepository: siteConfig.repositoryUrl,
        license: "https://www.apache.org/licenses/LICENSE-2.0",
        isAccessibleForFree: true,
        publisher: { "@id": `${siteConfig.url}/#organization` },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name,
        description,
        isPartOf: { "@id": `${siteConfig.url}/#website` },
        about: { "@id": `${siteConfig.url}/#software` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        inLanguage: "en",
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Kortyx",
            item: siteConfig.url,
          },
          {
            "@type": "ListItem",
            position: 2,
            name,
            item: url,
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Structured data is generated from local constants.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
