import "server-only";

import { defineWorkflow } from "kortyx";
import { WORKFLOW_IDS } from "@/lib/protocol";
import { chatNode } from "../nodes/general-chat/chat-node";

export const generalChatWorkflow = defineWorkflow({
  id: WORKFLOW_IDS.generalChat,
  version: "1.0.0",
  description: "Single-node Canvas Agent chat workflow.",
  nodes: {
    chat: {
      run: chatNode,
      params: {
        temperature: 0.3,
      },
    },
  },
  edges: [
    ["__start__", "chat"],
    ["chat", "__end__"],
  ],
});
