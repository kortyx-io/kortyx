import { getCloudLegalManifest } from "@/lib/cloud-legal";
export const dynamic = "force-static";
export function GET() {
  return Response.json(getCloudLegalManifest(), {
    headers: {
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
