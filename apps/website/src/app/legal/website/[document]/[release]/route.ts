import { getPublishedLegal } from "@/lib/legal-feed";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ document: string; release: string }> },
) {
  const { document: slug, release } = await params;
  const document = release.endsWith(".json")
    ? await getPublishedLegal("website", slug, release.slice(0, -5))
    : null;
  if (!document) return new Response("Not found", { status: 404 });
  return new Response(document.bytes, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-SHA256": document.entry.hash,
      "X-Legal-Content-Format": document.entry.contentFormat,
      "X-Legal-Hash-Contract":
        document.entry.contentFormat === "website-content-v1"
          ? "kortyx-website-content-sha256-v1"
          : "kortyx-cloud-json-sha256-v1",
    },
  });
}
