"use server";

import { readStream, type StreamChunk } from "kortyx";
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
  const response = await agent.processChat(args.messages, {
    sessionId: args.sessionId,
    ...(args.workflowId ? { workflowId: args.workflowId } : {}),
  });

  const chunks: StreamChunk[] = [];
  for await (const chunk of readStream(response.body)) {
    chunks.push(chunk);
  }
  return chunks;
}
