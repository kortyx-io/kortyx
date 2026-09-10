"use client";

import { createRouteChatTransport, useChat } from "@kortyx/react";
import { ChatWindow } from "@/components/features/chat/chat-window";

export default function LimitsPage() {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: "/api/limits",
      checkpointEndpoint: "/api/chat/checkpoints",
    }),
  });
  return (
    <main className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="border-b border-slate-800 px-6 py-4 text-sm text-slate-300">
        <h1 className="font-semibold text-white">Execution limits</h1>
        <p>
          Send any message to start research and review. The run pauses after
          its first child workflow. Choose Continue to finish.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <ChatWindow chat={chat} />
      </div>
    </main>
  );
}
