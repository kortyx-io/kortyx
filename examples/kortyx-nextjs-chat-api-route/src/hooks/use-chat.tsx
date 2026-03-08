"use client";

import { useContext } from "react";
import { ChatContext, type ChatContextValue } from "@/context/chat-context";

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
