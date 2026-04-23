"use client";

import { ChatWindow } from "@/components/features/chat/chat-window";
import { useChat } from "@/hooks/use-chat";
import { createBrowserChatStorage } from "@/lib/chat-storage";
import { createServerActionChatTransport } from "@/lib/chat-transport";

export default function Home() {
  const chat = useChat({
    transport: createServerActionChatTransport(),
    storage: createBrowserChatStorage(),
  });

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <ChatWindow chat={chat} />
    </div>
  );
}
