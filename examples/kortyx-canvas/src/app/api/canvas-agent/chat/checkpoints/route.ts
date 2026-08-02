import {
  handleCheckpointRequestBody,
  parseCheckpointRequestBody,
} from "kortyx";
import { agent } from "@/lib/agent";
import { flushCanvasTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = parseCheckpointRequestBody(await request.json());
    return await handleCheckpointRequestBody({ agent, body });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  } finally {
    await flushCanvasTelemetry();
  }
}
