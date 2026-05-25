import { defineWorkflow } from "kortyx";
import { loremMcpNode } from "@/nodes/mcp/lorem-mcp.node";

export const mcpLoremDemoWorkflow = defineWorkflow({
  id: "mcp-lorem-demo",
  version: "1.0.0",
  description: "Workflow demonstrating provider-native tool calls through MCP.",
  nodes: {
    lorem: {
      run: loremMcpNode,
    },
  },
  edges: [
    ["__start__", "lorem"],
    ["lorem", "__end__"],
  ],
});
