// Only public identifiers belong in this contract. Service/admin keys never do.
export type WebsiteAnalyticsConfig = {
  posthogKey: string;
  gaMeasurementId: string;
  cloudflareToken: string;
  paths: string[];
};

export function websiteAnalyticsIdentifiers(
  env: Record<string, string | undefined>,
  hostname: string,
): Omit<WebsiteAnalyticsConfig, "paths"> | null {
  if (env.WEBSITE_ANALYTICS_ENABLED !== "true" || hostname !== "kortyx.io")
    return null;
  const posthogKey = env.WEBSITE_POSTHOG_KEY ?? "";
  const gaMeasurementId = env.WEBSITE_GA4_ID ?? "";
  const cloudflareToken = env.WEBSITE_CLOUDFLARE_ANALYTICS_TOKEN ?? "";
  if (
    !/^phc_[A-Za-z0-9]+$/.test(posthogKey) ||
    !/^G-[A-Z0-9]+$/.test(gaMeasurementId) ||
    !/^[a-f0-9]{32}$/.test(cloudflareToken)
  )
    return null;
  return { posthogKey, gaMeasurementId, cloudflareToken };
}

export function analyticsPage(pathname: string, paths: string[]) {
  return paths.includes(pathname)
    ? { path: pathname, url: `https://kortyx.io${pathname}` }
    : null;
}

export function analyticsSource(referrer: string) {
  if (!referrer) return { source: "direct", referrer: "" };
  try {
    const host = new URL(referrer).hostname;
    const sources = [
      [
        "google",
        ["google.com", "google.es", "google.co.uk", "google.de", "google.fr"],
        "https://www.google.com/",
      ],
      ["bing", ["bing.com"], "https://www.bing.com/"],
      ["duckduckgo", ["duckduckgo.com"], "https://duckduckgo.com/"],
      ["github", ["github.com"], "https://github.com/"],
      ["npm", ["npmjs.com"], "https://www.npmjs.com/"],
    ] as const;
    for (const [source, domains, canonical] of sources) {
      if (domains.some((domain) => host === domain || host === `www.${domain}`))
        return { source, referrer: canonical };
    }
    return { source: host === "kortyx.io" ? "direct" : "other", referrer: "" };
  } catch {
    return { source: "other", referrer: "" };
  }
}
