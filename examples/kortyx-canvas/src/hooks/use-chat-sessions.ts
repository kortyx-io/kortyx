"use client";

import { useContext } from "react";
import {
  ChatSessionsContext,
  type ChatSessionsValue,
} from "@/providers/chat-sessions";

export function useChatSessions(): ChatSessionsValue {
  const ctx = useContext(ChatSessionsContext);
  if (!ctx) {
    throw new Error("useChatSessions must be inside <ChatSessionsProvider>");
  }
  return ctx;
}
