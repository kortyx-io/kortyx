"use client";

import { ChatWindow } from "@/components/features/chat/chat-window";
import { ChatProvider } from "@/context/chat-context";

export default function Home() {
  const test: any = "";
  return (
    <ChatProvider>
      <div className="h-screen w-screen flex items-center justify-center">
        <ChatWindow />
      </div>
    </ChatProvider>
  );
}
