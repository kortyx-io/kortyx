"use client";

import { createRouteChatTransport } from "@kortyx/react";
import { ChatWindow } from "@/components/features/chat/chat-window";
import { useChat } from "@/hooks/use-chat";

export default function Home() {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: "/api/chat",
      getBody: ({ sessionId, workflowId, messages }) => ({
        sessionId,
        workflowId,
        messages,
      }),
    }),
  });

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <ChatWindow chat={chat} />
    </div>
  );
}
