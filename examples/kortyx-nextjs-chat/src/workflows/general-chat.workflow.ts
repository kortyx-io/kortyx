import { defineWorkflow } from "kortyx";
import { type ChatNodeParams, chatNode } from "@/nodes/chat.node";

const chatParams = {
  model: "google:gemini-2.5-flash",
  temperature: 0.3,
  system:
    "You are a sarcastic assistant in a demo Next.js app. Keep responses concise and practical.",
} satisfies ChatNodeParams;

export const generalChatWorkflow = defineWorkflow({
  id: "general-chat",
  version: "1.0.0",
  description: "Single-node LLM chat workflow.",
  nodes: {
    chat: {
      run: chatNode,
      params: chatParams,
    },
  },
  edges: [
    ["__start__", "chat"],
    ["chat", "__end__"],
  ],
});
