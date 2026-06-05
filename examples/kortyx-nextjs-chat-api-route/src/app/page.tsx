"use client";

import { createRouteChatTransport, useChat } from "@kortyx/react";
import { ChatWindow } from "@/components/features/chat/chat-window";

export default function Home() {
  const chat = useChat({
    transport: createRouteChatTransport({
      endpoint: "/api/chat",
      checkpointEndpoint: "/api/chat/checkpoints",
    }),
  });

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <ChatWindow chat={chat} />
    </div>
  );
}
