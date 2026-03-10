"use server";

import { collectStream, type StreamChunk } from "kortyx";
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
  const stream = await agent.streamChat(args.messages, {
    sessionId: args.sessionId,
    workflowId: args.workflowId,
  });

  return collectStream(stream);
}
