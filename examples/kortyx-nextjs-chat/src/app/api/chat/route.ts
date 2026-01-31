import { createStreamResponse, type StreamChunk } from "kortyx";
import type { NextRequest } from "next/server";
import { agent } from "@/lib/kortyx-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
};

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as {
      sessionId?: string;
      messages?: ChatMessage[];
    };

    const sessionId = body.sessionId ?? "anonymous-session";
    const messages = body.messages ?? [];

    return await agent.processChat(messages, { sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createStreamResponse(
      (async function* (): AsyncGenerator<StreamChunk> {
        yield { type: "error", message };
        yield { type: "done" };
      })(),
    );
  }
}
