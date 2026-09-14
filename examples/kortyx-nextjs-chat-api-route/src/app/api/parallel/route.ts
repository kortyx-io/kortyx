import { createFailureResponse, readRequestJson } from "kortyx";
import type { z } from "zod";
import { agent } from "@/lib/kortyx-client";
import {
  parallelDemoWorkflow,
  parallelWorkerId,
} from "@/workflows/parallel-demo.workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({
    workflow: parallelDemoWorkflow.id,
    workerId: parallelWorkerId,
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readRequestJson(request);
    if (body.action === "resume") {
      return Response.json(
        await agent.resume({
          workflow: parallelDemoWorkflow,
          resume: body.resume as Parameters<typeof agent.resume>[0]["resume"],
          response: body.response as Parameters<
            typeof agent.resume
          >[0]["response"],
          abortSignal: request.signal,
        }),
      );
    }
    if (body.action !== "execute")
      return Response.json(
        { error: "Use execute or resume." },
        { status: 400 },
      );
    return Response.json(
      await agent.execute({
        workflow: parallelDemoWorkflow,
        // execute validates untrusted input against this schema before running.
        input: body.input as z.input<typeof parallelDemoWorkflow.inputSchema>,
        abortSignal: request.signal,
        // This example offers a fixed lower allowance, never client-selected ceilings.
        ...(body.limited === true
          ? { limits: { maxChildInvocations: 1 } }
          : {}),
      }),
    );
  } catch (error) {
    return createFailureResponse(error);
  }
}
