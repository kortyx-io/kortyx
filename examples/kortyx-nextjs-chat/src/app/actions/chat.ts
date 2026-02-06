"use server";

import { readStream, type StreamChunk } from "kortyx";
import { agent } from "@/lib/kortyx-client";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
};

export async function runChat(args: {
  sessionId: string;
  workflowId?: string;
  messages: ChatMessage[];
}): Promise<StreamChunk[]> {
  try {
    const resp = await agent.processChat(args.messages, {
      sessionId: args.sessionId,
      ...(args.workflowId !== undefined ? { workflowId: args.workflowId } : {}),
    });

    const chunks: StreamChunk[] = [];
    for await (const chunk of readStream(resp.body)) {
      chunks.push(chunk);
    }
    return chunks;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{ type: "error", message }, { type: "done" }] as StreamChunk[];
  }
}
