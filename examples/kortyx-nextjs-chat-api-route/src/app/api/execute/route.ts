import { createFailureResponse, readRequestJson } from "kortyx";
import type { z } from "zod";
import { agent } from "@/lib/kortyx-client";
import { briefReviewWorkflow } from "@/workflows/brief-review.workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readRequestJson(request);
    const result = await agent.execute({
      abortSignal: request.signal,
      workflow: briefReviewWorkflow,
      // execute validates untrusted input against this schema before running.
      input: body.input as z.input<typeof briefReviewWorkflow.inputSchema>,
    });
    return Response.json(result);
  } catch (error) {
    return createFailureResponse(error);
  }
}
