import type { KortyxExecutableTool, KortyxToolResult } from "@kortyx/providers";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type McpHttpTransportConfig = {
  type: "http";
  url: string | URL;
  headers?: Record<string, string> | undefined;
  fetch?: typeof fetch | undefined;
};

export type McpSseTransportConfig = {
  type: "sse";
  url: string | URL;
  headers?: Record<string, string> | undefined;
  fetch?: typeof fetch | undefined;
};

export type McpStdioTransportConfig = {
  type: "stdio";
  command: string;
  args?: string[] | undefined;
  env?: Record<string, string> | undefined;
  cwd?: string | undefined;
};

export type McpTransportConfig =
  | McpHttpTransportConfig
  | McpSseTransportConfig
  | McpStdioTransportConfig
  | Transport;

export type CreateMCPClientArgs = {
  name?: string | undefined;
  version?: string | undefined;
  transport: McpTransportConfig;
};

export type McpToolsArgs = {
  include?: string[] | undefined;
  closeAfterUse?: boolean | undefined;
};

type McpToolExecutionContext = {
  toolCallId: string;
  abortSignal?: AbortSignal | undefined;
};

export type MCPClient = {
  tools: (args?: McpToolsArgs) => Promise<KortyxExecutableTool[]>;
  close: () => Promise<void>;
};

const isTransport = (value: McpTransportConfig): value is Transport =>
  typeof (value as Transport).start === "function" &&
  typeof (value as Transport).send === "function";

const createTransport = (transport: McpTransportConfig): Transport => {
  if (isTransport(transport)) return transport;

  if (transport.type === "http") {
    return new StreamableHTTPClientTransport(new URL(String(transport.url)), {
      ...(transport.headers || transport.fetch
        ? {
            requestInit: {
              ...(transport.headers ? { headers: transport.headers } : {}),
            },
            ...(transport.fetch ? { fetch: transport.fetch } : {}),
          }
        : {}),
    }) as unknown as Transport;
  }

  if (transport.type === "sse") {
    return new SSEClientTransport(new URL(String(transport.url)), {
      ...(transport.headers
        ? { requestInit: { headers: transport.headers } }
        : {}),
      ...(transport.fetch ? { fetch: transport.fetch } : {}),
    }) as unknown as Transport;
  }

  return new StdioClientTransport({
    command: transport.command,
    ...(transport.args ? { args: transport.args } : {}),
    ...(transport.env ? { env: transport.env } : {}),
    ...(transport.cwd ? { cwd: transport.cwd } : {}),
  }) as unknown as Transport;
};

const stringifyContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (
          item &&
          typeof item === "object" &&
          "type" in item &&
          (item as { type?: unknown }).type === "text" &&
          typeof (item as { text?: unknown }).text === "string"
        ) {
          return (item as { text: string }).text;
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .join("\n");
  }
  if (content === undefined || content === null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
};

export const createMCPClient = async (
  args: CreateMCPClientArgs,
): Promise<MCPClient> => {
  const client = new Client({
    name: args.name ?? "kortyx",
    version: args.version ?? "0.1.0",
  });
  const transport = createTransport(args.transport);
  await client.connect(transport);

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await client.close();
  };

  return {
    async tools(toolArgs = {}) {
      if (closed) {
        throw new Error(
          "MCP client is already closed. Create a new client before listing tools.",
        );
      }

      const include = new Set(toolArgs.include ?? []);
      const listed = await client.listTools();
      const closeAfterUse = toolArgs.closeAfterUse ?? true;

      return listed.tools
        .filter((tool) => include.size === 0 || include.has(tool.name))
        .map(
          (mcpTool): KortyxExecutableTool => ({
            name: mcpTool.name,
            ...(mcpTool.title ? { title: mcpTool.title } : {}),
            ...(mcpTool.description
              ? { description: mcpTool.description }
              : {}),
            inputSchema: mcpTool.inputSchema,
            ...(mcpTool.outputSchema
              ? { outputSchema: mcpTool.outputSchema }
              : {}),
            ...(mcpTool.annotations
              ? { annotations: mcpTool.annotations }
              : {}),
            metadata: {
              source: "mcp",
              ...(mcpTool._meta ? { mcp: mcpTool._meta } : {}),
            },
            closeAfterUse,
            source: "mcp",
            close,
            execute: async (
              input: unknown,
              context: McpToolExecutionContext,
            ): Promise<KortyxToolResult> => {
              if (closed) {
                throw new Error(
                  `MCP client for tool "${mcpTool.name}" is already closed.`,
                );
              }
              const result = await client.callTool(
                {
                  name: mcpTool.name,
                  arguments:
                    input && typeof input === "object" && !Array.isArray(input)
                      ? (input as Record<string, unknown>)
                      : {},
                },
                undefined,
                context.abortSignal
                  ? { signal: context.abortSignal }
                  : undefined,
              );

              const isError =
                "isError" in result && typeof result.isError === "boolean"
                  ? result.isError
                  : undefined;

              return {
                toolCallId: context.toolCallId,
                name: mcpTool.name,
                content: stringifyContent(
                  "content" in result ? result.content : result,
                ),
                ...("structuredContent" in result &&
                result.structuredContent !== undefined
                  ? { structuredContent: result.structuredContent }
                  : {}),
                ...(isError !== undefined ? { isError } : {}),
                raw: result,
              };
            },
          }),
        );
    },
    close,
  };
};
