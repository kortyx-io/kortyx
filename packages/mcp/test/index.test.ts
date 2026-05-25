import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { createMCPClient } from "../src";

class FakeMCPTransport implements Transport {
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JSONRPCMessage) => void) | undefined;
  closed = false;

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    if (!("id" in message) || !("method" in message)) return;

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
                  name: "lookup_order",
                  description: "Look up an order.",
                  inputSchema: {
                    type: "object",
                    properties: { orderId: { type: "string" } },
                  },
                },
              ],
            }
          : {
              content: [{ type: "text", text: "Order is ready." }],
              structuredContent: { status: "ready" },
            };

    queueMicrotask(() => {
      this.onmessage?.({
        jsonrpc: "2.0",
        id: message.id,
        result,
      } as JSONRPCMessage);
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.onclose?.();
  }
}

describe("createMCPClient", () => {
  it("lists MCP tools and normalizes tool call results", async () => {
    const transport = new FakeMCPTransport();
    const mcpClient = await createMCPClient({ transport });
    const tools = await mcpClient.tools();

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "lookup_order",
      description: "Look up an order.",
      source: "mcp",
      closeAfterUse: true,
    });

    const result = await tools[0]?.execute(
      { orderId: "ord_1" },
      { toolCallId: "call-1" },
    );

    expect(result).toMatchObject({
      toolCallId: "call-1",
      name: "lookup_order",
      content: "Order is ready.",
      structuredContent: { status: "ready" },
    });

    await mcpClient.close();
    expect(transport.closed).toBe(true);
  });
});
