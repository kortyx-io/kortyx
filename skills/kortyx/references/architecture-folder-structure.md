# Folder Structure

Treat folder names as a default starting point, not a rule.

For new apps, use a structure that makes the runtime boundary obvious. For existing apps, preserve the app's current conventions and map these responsibilities into the closest existing folders. Do not reorganize a working app just to match these examples.

The important part is the boundary:

- server-only: agent setup, provider configuration when needed, workflows, nodes, and persistence adapters
- client: chat UI, `@kortyx/react` transport setup, and stream-piece rendering
- app-owned: auth, business services, database persistence, and schemas

## Suggested Next.js Baseline

```text
src/
  app/
    api/chat/route.ts
    page.tsx
  components/
    chat/
  lib/
    kortyx-client.ts
  nodes/
    chat.node.ts
    interrupt/
    reason/
  workflows/
    general-chat.workflow.ts
  services/
    conversations.ts
    auth.ts
  schemas/
    chat.ts
```

## Suggested React + Node Baseline

```text
apps/
  web/
    src/
      components/
      lib/kortyx-transport.ts
      pages-or-routes/
  api/
    src/
      routes/chat.ts
      lib/kortyx-client.ts
      nodes/
      workflows/
      services/
      schemas/
```

## Responsibility Rules

- Put `createAgent(...)` in a server-only module.
- Import built-in providers such as `google` from `kortyx` directly when the default setup is enough.
- Put custom provider factories or credential overrides in a server-only module only when the app needs explicit provider configuration.
- Put workflow topology in a workflow-owned area.
- Put executable node logic in a node-owned area.
- Put app database/business logic in the app's service/domain layer.
- Put shared validation schemas where the app already keeps shared schemas.
- Avoid importing server-only Kortyx runtime modules into client components.
- Avoid broad folder moves unless the user asked for a restructure.
