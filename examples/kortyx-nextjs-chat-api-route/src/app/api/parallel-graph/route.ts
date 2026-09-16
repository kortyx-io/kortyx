import { createFailureResponse, readRequestJson } from "kortyx";
import type { z } from "zod";
import { agent } from "@/lib/kortyx-client";
import { parallelWorkerId } from "@/workflows/parallel-demo.workflow";
import { parallelGraphDemoWorkflow } from "@/workflows/parallel-graph-demo.workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({
    workflow: parallelGraphDemoWorkflow.id,
    workerId: parallelWorkerId,
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readRequestJson(request);
    if (body.action === "resume")
      return Response.json(
        await agent.resume({
          workflow: parallelGraphDemoWorkflow,
          resume: body.resume as Parameters<typeof agent.resume>[0]["resume"],
          response: body.response as Parameters<
            typeof agent.resume
          >[0]["response"],
          abortSignal: request.signal,
        }),
      );
    if (body.action !== "execute")
      return Response.json(
        { error: "Use execute or resume." },
        { status: 400 },
      );
    return Response.json(
      await agent.execute({
        workflow: parallelGraphDemoWorkflow,
        input: body.input as z.input<
          typeof parallelGraphDemoWorkflow.inputSchema
        >,
        abortSignal: request.signal,
        ...(body.limited === true
          ? { limits: { maxChildInvocations: 1 } }
          : {}),
      }),
    );
  } catch (error) {
    return createFailureResponse(error);
  }
}
