import { cloudLegalUrls, getCloudLegalManifest } from "@/lib/cloud-legal";
import { createLegalFeed, legalFeedConfig } from "@/lib/legal-feed";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = legalFeedConfig();
  if (!config)
    return Response.json(getCloudLegalManifest(), {
      headers: {
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  const documents = (await createLegalFeed(config).list()).filter(
    (item) => item.product === "cloud",
  );
  return Response.json(
    {
      schemaVersion: 2,
      hashContract: "kortyx-cloud-json-sha256-v1",
      hashAlgorithm: "SHA-256",
      environment: config.environment,
      currentVersions: Object.fromEntries(
        documents.map((item) => [item.documentId, item.currentVersion]),
      ),
      cloudActivation: "managed-by-cloud",
      releases: documents.map((item) => {
        const slug = item.documentId.split(".")[2];
        return {
          ...item,
          id: item.documentId,
          slug,
          ...cloudLegalUrls(
            slug,
            item.version,
            config.environment === "production"
              ? "https://kortyx.io"
              : "https://staging.kortyx.dev",
          ),
        };
      }),
    },
    { headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } },
  );
}
