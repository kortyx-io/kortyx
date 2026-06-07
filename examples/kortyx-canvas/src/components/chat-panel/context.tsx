"use client";

import { createContext, useContext } from "react";
import type { ChatPanelContextValue } from "@/types/chat-panel";

export const ChatPanelContext = createContext<ChatPanelContextValue | null>(
  null,
);

export function useChatPanel(): ChatPanelContextValue {
  const ctx = useContext(ChatPanelContext);
  if (!ctx) {
    throw new Error("ChatHeader/Body must be inside <ChatProvider>");
  }
  return ctx;
}
