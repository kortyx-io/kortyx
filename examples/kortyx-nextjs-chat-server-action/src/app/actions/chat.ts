"use server";

import { collectStream, type StreamChunk, serializeFailure } from "kortyx";
import { agent } from "@/lib/kortyx-client";

export async function runChat(args: {
  sessionId: string;
  workflowId?: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}): Promise<StreamChunk[]> {
  try {
    const stream = await agent.streamChat(args.messages, {
      sessionId: args.sessionId,
      workflowId: args.workflowId,
    });

    return await collectStream(stream);
  } catch (error) {
    const failure = serializeFailure(error);
    return [
      { type: "error", message: failure.message, failure },
      { type: "done" },
    ];
  }
}
