import { siteConfig } from "@/lib/site";

const websiteOrigin = new URL(siteConfig.url).origin;

/** Keep site navigation in place; open other web destinations safely. */
export function externalLinkProps(href: string) {
  try {
    const url = new URL(href, siteConfig.url);
    if (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin !== websiteOrigin
    ) {
      return { target: "_blank", rel: "noopener noreferrer" } as const;
    }
  } catch {
    // Invalid destinations are not external web links.
  }

  return {};
}
