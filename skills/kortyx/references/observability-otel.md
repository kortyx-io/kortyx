# OpenTelemetry Observability

Use this reference when adding or reviewing Kortyx tracing in an app.

## Placement

- Configure the OpenTelemetry SDK/exporter in server bootstrap code before `createAgent(...)`.
- Keep tracing server-side. React clients should pass identifiers such as `sessionId`; provider calls and token usage are emitted by server runtime code.
- Use `@kortyx/otel` for the adapter and keep exporter/backend setup app-owned.

## Agent Wiring

```ts
import { createOpenTelemetryTraceAdapter } from "@kortyx/otel";
import { createAgent } from "kortyx";

export const agent = createAgent({
  workflows,
  getProvider,
  telemetry: {
    trace: createOpenTelemetryTraceAdapter({
      captureContent: false,
    }),
  },
});
```

Pass stable request context when calling the agent:

```ts
await agent.streamChat(messages, {
  sessionId: threadId,
  context: {
    userId,
    tenantId,
  },
});
```

## Identity Propagation

React clients can pass request context through `useChat({ context })`, and route transports send `{ sessionId, workflowId, messages, context }` by default.

For authenticated apps, derive trusted identity on the server before calling the agent:

```ts
const body = parseChatRequestBody(await request.json());
const session = await getSession(request);

const stream = await agent.streamChat(body.messages, {
  sessionId: body.sessionId,
  workflowId: body.workflowId,
  context: {
    ...body.context,
    userId: session.user.id,
    tenantId: session.tenant.id,
  },
});
```

Additional context values from the client, such as `accountId`, are copied into trace metadata. For example, `context.accountId` is emitted as `kortyx.trace.metadata.accountId`. Map it in `createOpenTelemetryTraceAdapter({ mapAttributes })` when the app needs a shorter or indexed attribute such as `app.account.id`.

Expected trace attributes:

- `session.id` and `gen_ai.conversation.id` from `sessionId`
- `user.id` from `context.userId`
- `kortyx.tenant.id` from `context.tenantId`
- `kortyx.trace.metadata.accountId` from `context.accountId`
- `kortyx.tool.call.count`, `kortyx.tool.result.count`, and `kortyx.tool.step.count` from MCP-enabled `useReason(...)` calls

MCP tool loops also add `useReason.tool-step.*` and `useReason.tool-call.*` events to the `useReason` span. Tool event attributes include `gen_ai.tool.name`, `kortyx.tool.name`, and `kortyx.tool.call.id` when available.

## Prompt Metadata

When a node uses an external prompt store, preserve prompt identity in `useReason`.

```ts
const prompt = await promptStore.get("assessment-chat");
const input = prompt.compile(vars);

await useReason({
  id: "assessment-chat",
  model,
  input,
  telemetry: {
    operation: "assessmentChat",
    prompt: {
      name: prompt.name,
      version: prompt.version,
      type: prompt.type,
      metadata: prompt.toJSON?.(),
    },
    tags: [`prompt:${prompt.name}:${prompt.version}`],
  },
});
```

## Content Capture

Raw input/output capture is off by default. Enable it only after confirming retention, privacy, and redaction requirements.

## Tags

Pass `tags: string[]` in `telemetry` to label runs with searchable strings. They are emitted as the OpenTelemetry attribute `kortyx.trace.tags`.

- `createAgent({ telemetry: { tags } })` applies tags to every `kortyx.run` span.
- `useReason({ telemetry: { tags } })` applies tags to that observation span.

If the backend expects a different attribute (for example, Langfuse looks for `langfuse.trace.tags`), rename via `createOpenTelemetryTraceAdapter({ mapAttributes })`.

## Trace Ids On The Client

When an OTel trace adapter is configured on the agent, the orchestrator emits a `trace` stream chunk right after `kortyx.run` opens:

```ts
{ type: "trace", traceId, spanId, runId, rootSpanName: "kortyx.run" }
```

`@kortyx/react` reads it and stamps `traceId`, `spanId`, and `runId` onto every assistant `ChatMsg` produced during the turn. Use `msg.traceId` to render trace deep links, attach scores, or POST feedback — no response-header capture or wrapper spans needed. The fields stay `undefined` when no trace adapter is wired.

`createBrowserChatStorage` serializes these fields, so restored messages keep their trace ids.

## Langfuse

Langfuse is an app-owned OpenTelemetry export recipe, not the Kortyx observability contract. Load `observability-langfuse.md` when implementing or reviewing it.

Full website walkthrough: `https://kortyx.io/docs/v0/production/langfuse`.
