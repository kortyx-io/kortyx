import { cookies } from "next/headers";
import { z } from "zod";
import { agent } from "@/lib/kortyx-client";
import { telemetry } from "@/lib/telemetry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sessionId = (await cookies()).get("background-demo-session")?.value;
  if (!sessionId) return Response.json({ interrupts: [] });
  return Response.json({
    interrupts: await agent.listInterrupts({
      sessionId,
      afterResponseCompleted: true,
    }),
  });
}

export async function POST(request: Request) {
  const sessionId = (await cookies()).get("background-demo-session")?.value;
  if (!sessionId)
    return Response.json({ error: "No demo session." }, { status: 401 });
  const body = z
    .object({ id: z.string().min(1), decision: z.enum(["save", "skip"]) })
    .safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "Invalid response." }, { status: 400 });
  // Never trust an ID alone. Resolve within the server-derived scope.
  const pending = await agent.getInterrupt(body.data.id, { sessionId });
  if (!pending)
    return Response.json(
      { error: "Interrupt unavailable or expired." },
      { status: 404 },
    );
  try {
    const result = await agent.resume({
      workflow: pending.workflow,
      resume: pending.resume,
      response: { type: "select", ids: [body.data.decision] },
      abortSignal: request.signal,
    });
    await telemetry?.flush();
    // Resume tokens stay on the server. This example's review has no second question.
    return Response.json({
      status: result.status,
      runId: result.runId,
      ...(result.status === "completed"
        ? {
            message:
              body.data.decision === "save"
                ? "Review approved. Background workflow completed."
                : "Review skipped. Background workflow completed.",
          }
        : {}),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
