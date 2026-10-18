import { getDocsSearchIndex } from "@/lib/docs";

// Build once with the public docs, separately from page HTML and RSC payloads.
export const dynamic = "force-static";

export async function GET() {
  return Response.json(await getDocsSearchIndex(), {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Robots-Tag": "noindex",
    },
  });
}
