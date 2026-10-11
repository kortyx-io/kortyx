import { createLegalFeed, legalFeedConfig } from "@/lib/legal-feed";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = legalFeedConfig();
  if (!config)
    return Response.json(
      { error: "Legal feed is not configured" },
      { status: 503 },
    );
  const documents = await createLegalFeed(config).list();
  return Response.json(
    {
      schemaVersion: 1,
      environment: config.environment,
      documents: documents.map((item) => {
        const slug = item.documentId.split(".")[2];
        const currentUrl = `${item.product === "cloud" ? "/cloud" : ""}/${slug}`;
        return {
          ...item,
          currentUrl,
          versionUrl: `${currentUrl}/${item.version}`,
          contentUrl: `/legal/${item.product}/${slug}/${item.version}.json`,
        };
      }),
    },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
