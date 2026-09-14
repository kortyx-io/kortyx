import { createFailureResponse, readRequestJson } from "kortyx";
import { agent } from "@/lib/kortyx-client";
import { briefReviewWorkflow } from "@/workflows/brief-review.workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readRequestJson(request);
    const result = await agent.resume({
      abortSignal: request.signal,
      workflow: briefReviewWorkflow,
      resume: body.resume as Parameters<typeof agent.resume>[0]["resume"],
      response: body.response as Parameters<typeof agent.resume>[0]["response"],
    });
    return Response.json(result);
  } catch (error) {
    return createFailureResponse(error);
  }
}
