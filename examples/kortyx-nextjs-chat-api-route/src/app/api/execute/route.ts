import { agent } from "@/lib/kortyx-client";
import { briefReviewWorkflow } from "@/workflows/brief-review.workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const result = await agent.execute({
      abortSignal: request.signal,
      workflow: briefReviewWorkflow,
      input: body.input,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
