import { studioReviewRequest } from "@/lib/studio-reviews";

export const runtime = "nodejs";
type Context = { params: Promise<{ runId: string }> };
export async function POST(request: Request, context: Context) {
  const { runId } = await context.params;
  // Route handlers receive decoded params; a second decode corrupts literal % IDs.
  return studioReviewRequest(request, runId);
}
export const DELETE = POST;
