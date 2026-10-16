import { getDocsSearchIndex } from "@/lib/docs";
import { getPublishedLegal } from "@/lib/legal-feed";
import { trustPageSlugs } from "@/lib/trust";
import { websiteAnalyticsIdentifiers } from "@/lib/website-analytics";

export const dynamic = "force-dynamic";

let knownPaths: Promise<string[]> | undefined;
function publicPagePaths() {
  // Read the immutable docs once. Calling the sitemap resolver here would
  // resolve every legacy route and repeatedly reload docs outside React render.
  knownPaths ??= getDocsSearchIndex()
    .then((docs) => {
      const paths = new Set([
        "/",
        "/product",
        "/examples",
        "/open-source",
        "/docs",
        ...trustPageSlugs.map((slug) => `/${slug}`),
      ]);
      for (const doc of docs) {
        const parts = doc.href.split("#", 1)[0].split("/");
        while (parts.length > 1) {
          paths.add(parts.join("/"));
          parts.pop();
        }
      }
      return [...paths].sort();
    })
    .catch((error: unknown) => {
      knownPaths = undefined;
      throw error;
    });
  return knownPaths;
}

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const disabled = () => Response.json(null, { headers });
  // Standalone Next reconstructs request.url using its internal bind address.
  // The proxy's original host identifies the public website being served.
  const host =
    request.headers.get("x-forwarded-host")?.split(",", 1)[0] ??
    request.headers.get("host") ??
    new URL(request.url).hostname;
  const identifiers = websiteAnalyticsIdentifiers(
    process.env,
    host.trim().toLowerCase().split(":", 1)[0],
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
    const paths = await publicPagePaths();
    return Response.json({ ...identifiers, paths }, { headers });
  } catch {
    // Optional measurement must never make the website or legal pages fail.
    return disabled();
  }
}
