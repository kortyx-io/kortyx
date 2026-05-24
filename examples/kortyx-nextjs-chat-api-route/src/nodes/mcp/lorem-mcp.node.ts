import { google } from "@kortyx/google";
import { createMCPClient, useReason } from "kortyx";

const DEFAULT_MCP_URL = "https://mcp-http-demo.arcade.dev/mcp";

export const loremMcpNode = async ({ input }: { input: unknown }) => {
  const mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: process.env.KORTYX_EXAMPLE_MCP_URL ?? DEFAULT_MCP_URL,
    },
  });

  const tools = await mcpClient.tools({ include: ["lorem"] });
  const result = await useReason({
    model: google("gemini-2.5-flash"),
    system:
      "You are testing MCP tool support in Kortyx. The lorem output is only valid if it comes from the available lorem tool. When the user asks for placeholder text, call the lorem tool before answering, then explain exactly what the tool returned.",
    input: String(input ?? "Generate eight words of lorem ipsum."),
    tools,
    toolPolicy: {
      maxSteps: 3,
      emit: { lorem: true },
    },
    emit: true,
    stream: true,
  });

  return {
    data: {
      text: result.text,
      toolCalls: result.toolCalls ?? [],
      toolResults: result.toolResults ?? [],
    },
    ui: { message: result.text },
  };
};
