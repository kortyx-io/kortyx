import {
  getCloudLegalDocument,
  getCloudLegalDocuments,
  serializeCloudLegalDocument,
} from "@/lib/cloud-legal";
export const dynamic = "force-static";
export const dynamicParams = false;
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
    ? getCloudLegalDocument(slug, release.slice(0, -5))
    : undefined;
  if (!document) return new Response("Not found", { status: 404 });
  return new Response(serializeCloudLegalDocument(document), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
