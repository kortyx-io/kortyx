---
id: v0-project-structure
title: "Project Structure"
description: "Place Kortyx agent setup, workflows, nodes, providers, persistence, app services, and React UI in clear server/client boundaries."
keywords: [kortyx, project-structure, architecture, folders, server-client-boundary]
sidebar_label: "Project Structure"
---
# Project Structure

Folder names are flexible. The important part is the boundary between server-only Kortyx execution, client UI, and app-owned business code.

## Responsibility Boundaries

| Area | Owns |
| --- | --- |
| Server-only Kortyx modules | `createAgent(...)`, provider setup, workflows, nodes, runtime persistence |
| Client UI | `@kortyx/react`, chat components, transport setup, stream-piece rendering |
| App-owned services | auth, rate limits, business database writes, durable conversation history, domain APIs |

Do not import server-only Kortyx runtime modules into client components. Keep provider credentials and runtime persistence adapters on the server.

## Suggested Next.js Layout

```text
src/
  app/
    api/chat/route.ts
    page.tsx
  components/
    chat/
      chat-window.tsx
      assistant-live-message.tsx
  lib/
    kortyx-client.ts
    providers.ts
  nodes/
    chat.node.ts
    classify.node.ts
  workflows/
    general-chat.workflow.ts
  services/
    auth.ts
    conversations.ts
  schemas/
    chat.ts
```

Use this as a baseline, not a migration requirement. In existing apps, map each responsibility into the nearest existing folder.

## Suggested React Plus Node Layout

```text
apps/
  web/
    src/
      components/
        chat/
      lib/
        kortyx-transport.ts
      routes/
  api/
    src/
      routes/
        chat.ts
      lib/
        kortyx-client.ts
        providers.ts
      nodes/
      workflows/
      services/
      schemas/
```

## Rules

- Put `createAgent(...)` in a server-only module.
- Use built-in provider refs such as `google(...)` directly when default environment-variable setup is enough.
- Put explicit provider factories or custom transport settings in a server-only module.
- Put workflow topology in workflow files.
- Put executable node logic in node files.
- Put database writes, auth, billing checks, and domain APIs in app services.
- Put durable product records in your app database, not Kortyx runtime state.
- Put short-lived interrupt/resume execution state in Kortyx runtime persistence.

## Example Server Boundary

```ts
// src/lib/kortyx-client.ts
import { createAgent } from "kortyx";
import { createFrameworkAdapterFromEnv } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  defaultWorkflowId: "general-chat",
  frameworkAdapter: createFrameworkAdapterFromEnv(),
});
```
```js
// src/lib/kortyx-client.js
import { createAgent } from "kortyx";
import { createFrameworkAdapterFromEnv } from "kortyx";
import { generalChatWorkflow } from "@/workflows/general-chat.workflow";

export const agent = createAgent({
  workflows: [generalChatWorkflow],
  defaultWorkflowId: "general-chat",
  frameworkAdapter: createFrameworkAdapterFromEnv(),
});
```

`src/lib/kortyx-client.ts` should be imported by API routes or other server-only modules, not by React client components.

## What to Read Next

- [Quickstart (Next.js API Route)](../01-getting-started/02-quickstart-nextjs.md)
- [React Frontend + Node Backend](./03-react-node-backend.md)
- [Runtime Persistence](../04-production/01-persistence.md)
- [Runtime Persistence Adapters](../04-production/02-framework-adapters.md)
