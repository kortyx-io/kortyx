import { anthropic } from "@kortyx/anthropic";
import { google } from "@kortyx/google";
import { openai } from "@kortyx/openai";
import { createMCPClient, useReason, useRuntimeContext } from "kortyx";

const DEFAULT_MCP_URL = "https://mcp-http-demo.arcade.dev/mcp";

type McpProviderId = "anthropic" | "google" | "openai";

type McpRuntimeContext = {
  provider?: string | undefined;
  model?: string | undefined;
};

const resolveProviderId = (value: unknown): McpProviderId => {
  if (value === "anthropic" || value === "openai" || value === "google") {
    return value;
  }
  return "google";
};

const resolveModel = (providerId: McpProviderId, modelOverride?: string) => {
  if (providerId === "openai") {
    return openai(
      modelOverride ??
        process.env.KORTYX_EXAMPLE_OPENAI_MODEL ??
        "gpt-4.1-mini",
    );
  }

  if (providerId === "anthropic") {
    return anthropic(
      modelOverride ??
        process.env.KORTYX_EXAMPLE_ANTHROPIC_MODEL ??
        "claude-haiku-4-5",
    );
  }

  return google(
    (modelOverride ??
      process.env.KORTYX_EXAMPLE_GOOGLE_MODEL ??
      "gemini-2.5-flash") as Parameters<typeof google>[0],
  );
};

export const loremMcpNode = async ({ input }: { input: unknown }) => {
  const context = useRuntimeContext<McpRuntimeContext>();
  const providerId = resolveProviderId(context.provider);
  const mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: process.env.KORTYX_EXAMPLE_MCP_URL ?? DEFAULT_MCP_URL,
    },
  });

  const tools = await mcpClient.tools({ include: ["lorem"] });
  const result = await useReason({
    model: resolveModel(providerId, context.model),
    system:
      "You are testing MCP tool support in Kortyx. The lorem output is only valid if it comes from the available lorem tool. When the user asks for placeholder text, call the lorem tool before answering, then explain exactly what the tool returned.",
    input: String(input ?? "Generate eight words of lorem ipsum."),
    tools,
    toolExecution: {
      maxSteps: 3,
      emit: { lorem: true },
    },
    emit: true,
    stream: true,
  });

  return {
    data: {
      provider: providerId,
      text: result.text,
      toolCalls: result.toolCalls ?? [],
      toolResults: result.toolResults ?? [],
    },
    ui: { message: result.text },
  };
};
