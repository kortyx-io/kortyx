"use client";

import { createChatTransport, useChat } from "@kortyx/react";
import { runChat } from "@/app/actions/chat";
import { ChatWindow } from "@/components/features/chat/chat-window";

export default function Home() {
  const chat = useChat({
    transport: createChatTransport({
      stream: ({ sessionId, workflowId, messages }) =>
        runChat({
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
