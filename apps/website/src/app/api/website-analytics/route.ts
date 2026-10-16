import sitemap from "@/app/sitemap";
import { getPublishedLegal } from "@/lib/legal-feed";
import { websiteAnalyticsIdentifiers } from "@/lib/website-analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const disabled = () => Response.json(null, { headers });
  const identifiers = websiteAnalyticsIdentifiers(
    process.env,
    new URL(request.url).hostname,
  );
  if (!identifiers) return disabled();
  // Enable only against the exact notices reviewed for this rollout. The live
  // registry can supersede checked-in archives, so a local text edit is insufficient.
  const version = process.env.WEBSITE_ANALYTICS_LEGAL_VERSION;
  if (!version) return disabled();
  try {
    const notices = await Promise.all(
      ["privacy", "cookies"].map((slug) => getPublishedLegal("website", slug)),
    );
    if (
      notices.some(
        (notice) =>
          !notice ||
          !notice.entry.productionApproved ||
          notice.entry.version !== version,
      )
    )
      return disabled();
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    return Response.json({ ...identifiers, paths }, { headers });
  } catch {
    // Optional measurement must never make the website or legal pages fail.
    return disabled();
  }
}
