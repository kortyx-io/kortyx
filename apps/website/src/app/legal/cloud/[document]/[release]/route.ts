import { getCloudLegalDocuments } from "@/lib/cloud-legal";
import { getPublishedLegal } from "@/lib/legal-feed";
export const dynamic = "force-dynamic";
export const dynamicParams = true;
export function generateStaticParams() {
  return getCloudLegalDocuments().map(({ slug, version }) => ({
    document: slug,
    release: `${version}.json`,
  }));
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ document: string; release: string }> },
) {
  const { document: slug, release } = await params;
  const document = release.endsWith(".json")
    ? await getPublishedLegal("cloud", slug, release.slice(0, -5))
    : undefined;
  if (!document) return new Response("Not found", { status: 404 });
  return new Response(document.bytes, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "X-Content-SHA256": document.entry.hash,
      "X-Legal-Content-Format": document.entry.contentFormat,
      "X-Legal-Hash-Contract": "kortyx-cloud-json-sha256-v1",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
