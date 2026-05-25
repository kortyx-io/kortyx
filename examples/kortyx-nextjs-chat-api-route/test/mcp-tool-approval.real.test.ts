import { fileURLToPath } from "node:url";
import { google } from "@kortyx/google";
import { config as loadEnv } from "dotenv";
import {
  collectBufferedStream,
  createAgent,
  createInMemoryFrameworkAdapter,
  createMCPClient,
  defineWorkflow,
  type KortyxExecutableTool,
  type McpTransportConfig,
  useReason,
} from "kortyx";
import { afterEach, describe, expect, it } from "vitest";

loadEnv({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

const hasGoogleApiKey = (): boolean =>
  Boolean(
    process.env.GOOGLE_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.KORTYX_GOOGLE_API_KEY ||
      process.env.KORTYX_GEMINI_API_KEY,
  );

const shouldRunRealApiTest =
  process.env.KORTYX_RUN_REAL_API_TESTS === "1" && hasGoogleApiKey();

const describeReal = shouldRunRealApiTest ? describe : describe.skip;
const toolExecutions: Array<{ name: string; input: unknown }> = [];

type JsonRpcMessage = {
  id?: string | number;
  method?: string;
  result?: unknown;
};

class FakeMCPTransport {
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JsonRpcMessage) => void) | undefined;

  async start(): Promise<void> {}

  async send(message: JsonRpcMessage): Promise<void> {
    if (message.id === undefined || message.method === undefined) return;

    const result =
      message.method === "initialize"
        ? {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "fake-mcp", version: "1.0.0" },
          }
        : message.method === "tools/list"
          ? {
              tools: [
                {
                  name: "lorem",
                  description:
                    "Generate lorem ipsum placeholder text with a requested word count.",
                  inputSchema: {
                    type: "object",
                    properties: {
                      words: {
                        type: "number",
                        description: "Number of lorem words to generate.",
                      },
                    },
                    required: ["words"],
                  },
                },
              ],
            }
          : {
              content: [{ type: "text", text: "lorem ipsum dolor sit" }],
              structuredContent: { text: "lorem ipsum dolor sit" },
            };

    queueMicrotask(() => {
      this.onmessage?.({
        jsonrpc: "2.0",
        id: message.id,
        result,
      } as JsonRpcMessage);
    });
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}

const toolApprovalNode = async ({ input }: { input: unknown }) => {
  const mcpClient = await createMCPClient({
    transport: new FakeMCPTransport() as McpTransportConfig,
  });

  const rawTools = await mcpClient.tools({ include: ["lorem"] });
  const tools = rawTools.map(
    (tool): KortyxExecutableTool => ({
      ...tool,
      execute: async (toolInput, context) => {
        toolExecutions.push({ name: tool.name, input: toolInput });
        return tool.execute(toolInput, context);
      },
    }),
  );

  const result = await useReason({
    model: google("gemini-2.5-flash", {
      maxOutputTokens: 128,
      temperature: 0,
    }),
    system:
      "You are testing Kortyx MCP tool approval. You must call the `lorem` tool exactly once before answering. Do not answer directly. Do not ask the user for confirmation yourself; use the available tool.",
    input: String(
      input ?? "Use the lorem tool to generate exactly four words.",
    ),
    tools,
    toolExecution: {
      maxSteps: 3,
      approval: true,
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

const toolApprovalWorkflow = defineWorkflow({
  id: "real-mcp-tool-approval",
  version: "1.0.0",
  nodes: {
    approval: {
      run: toolApprovalNode,
      params: {},
    },
  },
  edges: [
    ["__start__", "approval"],
    ["approval", "__end__"],
  ],
});

describeReal("real MCP tool approval", () => {
  afterEach(() => {
    toolExecutions.length = 0;
  });

  it("interrupts before executing a real model-requested MCP tool call", async () => {
    const agent = createAgent({
      workflows: [toolApprovalWorkflow],
      defaultWorkflowId: "real-mcp-tool-approval",
      frameworkAdapter: createInMemoryFrameworkAdapter(),
    });

    const result = await collectBufferedStream(
      await agent.streamChat(
        [
          {
            role: "user",
            content: "Generate exactly four lorem ipsum words.",
          },
        ],
        {
          sessionId: `real-mcp-tool-approval-${Date.now()}`,
          workflowId: "real-mcp-tool-approval",
        },
      ),
    );

    const interrupt = result.chunks.find((chunk) => chunk.type === "interrupt");

    expect(interrupt).toMatchObject({
      type: "interrupt",
      node: "approval",
      input: {
        kind: "choice",
        question: "Approve lorem?",
        meta: {
          tool: "lorem",
        },
      },
    });
    expect(result.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-call-start",
          tool: "lorem",
        }),
      ]),
    );
    expect(result.chunks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-call-result",
          tool: "lorem",
        }),
      ]),
    );
    expect(toolExecutions).toEqual([]);
  }, 60_000);
});
