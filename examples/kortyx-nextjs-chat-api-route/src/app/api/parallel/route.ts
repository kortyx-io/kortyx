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
    const body = await request.json();
    if (body.action === "resume") {
      return Response.json(
        await agent.resume({
          workflow: parallelDemoWorkflow,
          resume: body.resume,
          response: body.response,
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
        input: body.input,
        abortSignal: request.signal,
        // This example offers a fixed lower allowance, never client-selected ceilings.
        ...(body.limited === true
          ? { limits: { maxChildInvocations: 1 } }
          : {}),
      }),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
