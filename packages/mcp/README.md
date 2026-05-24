# @kortyx/mcp

MCP client helpers for Kortyx.

```ts
import { createMCPClient } from "@kortyx/mcp";

const mcpClient = await createMCPClient({
  transport: {
    type: "http",
    url: "https://your-server.com/mcp",
  },
});

const tools = await mcpClient.tools();
```

Tools returned by `mcpClient.tools()` are request scoped by default. When passed
to `useReason(...)`, Kortyx closes the underlying MCP client when the call
finishes, errors, or interrupts. Use `tools({ closeAfterUse: false })` for
long-lived clients that you close manually.
