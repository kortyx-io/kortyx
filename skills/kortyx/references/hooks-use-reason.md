# `useReason(...)`

`useReason(...)` is the node-level API for model reasoning. Use it when a Kortyx node needs an LLM call and should participate in Kortyx streaming, tracing, checkpointing, structured output, or interrupt/resume behavior.

## Mental Model

A `useReason(...)` call has three layers:

- request: model, prompt, generation options, and provider options
- runtime behavior: streaming, emitted chunks, checkpoints, interrupts
- result: final text, parsed output, metadata, warnings, and optional interrupt response

Keep provider credentials and model construction on the server. Call `useReason(...)` only from Kortyx node execution, not from React/client code.

## Basic Shape

```ts
import { google, useReason } from "kortyx";

export const chatNode = async ({ input }: { input: unknown }) => {
  const result = await useReason({
    id: "chat",
    model: google("gemini-2.5-flash"),
    system: "You are a concise assistant.",
    input: String(input ?? ""),
    temperature: 0.3,
    stream: true,
    emit: true,
  });

  return {
    data: { text: result.text },
  };
};
```

## Required And Common Inputs

- `model`: required provider model reference.
- `input`: required user/task prompt string.
- `system`: durable behavior or role instruction.
- `id`: stable call id, recommended when the node can replay or has multiple reason calls.
- `stream`: whether the provider call should stream when supported.
- `emit`: whether Kortyx should emit stream chunks for the client.
- `temperature`, `maxOutputTokens`, `stopSequences`: common generation controls.
- `reasoning`, `responseFormat`: provider-neutral advanced controls when supported.
- `providerOptions`: provider-specific options. Prefer generic options first.
- `abortSignal`: cancellation signal from route/client plumbing when available.
- `tools`: MCP tools returned by `createMCPClient(...).tools()`.
- `toolExecution`: MCP tool loop controls such as `maxSteps`, `approval`, and `emit`.

Use `stream: true` and `emit: true` for live UI output. Use `emit: false` for internal reasoning that should not render directly.

## Emission Vs Node `ui.message`

Do not return `ui: { message: result.text }` from the same node when `useReason({ emit: true })` already streams the answer. `emit: true` sends text chunks to the client during the model call. Returning `ui.message` also emits a separate `message` chunk from the node result, so the same content can appear twice in the stream/API response.

Return `data: { text: result.text }` when later workflow nodes should read the text. Node `data` becomes part of the flowing workflow payload/state; it is not the same thing as client-facing `ui.message`.

Use one of these patterns:

- Live streamed answer: `useReason({ stream: true, emit: true })`, then return `data` only.
- Final-only answer: `useReason({ stream: false, emit: false })`, then return `ui: { message }` if the client should receive the final message.
- Internal reasoning: `useReason({ emit: false })`, then return only `data` unless the result should be shown.
- Custom final message different from the streamed reasoning: return `ui.message` only when the extra message is intentional.

## Result Shape

```ts
const result = await useReason({ model, input });

result.id; // stable id when provided
result.opId; // runtime operation id
result.text; // final assistant text
result.output; // parsed object when outputSchema succeeds
result.raw; // provider-native payload for debugging
result.usage; // normalized token usage when available
result.finishReason; // normalized stop reason
result.providerMetadata; // provider-specific normalized metadata
result.warnings; // unsupported option or compatibility warnings
result.interruptResponse; // human response in interrupt mode
result.toolCalls; // MCP/model tool calls made during a tool loop
result.toolResults; // MCP tool results returned to the model
result.steps; // per-model-pass text, tool calls, and tool results
```

Always code a sensible fallback when `result.output` may be absent.

## MCP Tools

Use MCP tools when the model should call external MCP server tools during one `useReason(...)` call.

```ts
import { createMCPClient, useReason } from "kortyx";

const mcpClient = await createMCPClient({
  transport: {
    type: "http",
    url: "https://your-server.com/mcp",
  },
});

const tools = await mcpClient.tools({
  include: ["search_issues", "get_issue"],
});

const result = await useReason({
  id: "triage",
  model,
  input: "Find open bugs and summarize the main risks.",
  tools,
  toolExecution: {
    maxSteps: 5,
    approval: false,
    emit: true,
  },
});
```

`maxSteps` is the maximum number of model passes in the tool loop. When the model requests a tool, Kortyx executes the MCP tool, appends the tool result to the next model pass, and continues until final text or the step limit.

`approval: true` uses Kortyx interrupts before executing tool calls. `emit: true` sends `tool-call-start`, `tool-call-result`, and `tool-call-error` stream chunks.

`include` is optional. Without it, `mcpClient.tools()` returns every tool advertised by the MCP server. Prefer `include` when a node should expose only a subset of server tools.

Normal `useReason.interrupt` and `tools` are mutually exclusive for now. If user input depends on tool results, run a tool `useReason(...)` call first and then a second interrupt `useReason(...)` call using `result.toolResults`. If tool input depends on user input, call `useInterrupt(...)` first and then pass the response into a tool-enabled `useReason(...)` call.

Tools returned by `mcpClient.tools()` are request-scoped by default. `useReason(...)` closes the underlying MCP client when the call finishes, errors, or interrupts. Use `mcpClient.tools({ closeAfterUse: false })` only when the app owns a long-lived MCP client and will close it manually.

MCP tool calling requires provider adapter support for native tool calls. `@kortyx/openai`, `@kortyx/google`, `@kortyx/anthropic`, `@kortyx/deepseek`, `@kortyx/groq`, and `@kortyx/mistral` implement the shared tool contracts.

## Plain Text Reasoning

Use plain text when the node only needs assistant text.

```ts
const result = await useReason({
  id: "answer-question",
  model,
  system: "Answer with practical details.",
  input: question,
  stream: true,
  emit: true,
});

return {
  data: { answer: result.text },
};
```

## Structured Output

Use `outputSchema` when downstream code depends on fields. Prompt the model to return JSON only when needed by the provider/model.

```ts
import { z } from "zod";

const PlanSchema = z.object({
  summary: z.string().min(1),
  nextSteps: z.array(z.string().min(1)),
});

type Plan = z.infer<typeof PlanSchema>;

const result = await useReason<Plan>({
  id: "make-plan",
  model,
  system: "Return JSON only.",
  input: "Create a short launch plan.",
  outputSchema: PlanSchema,
  responseFormat: { type: "json" },
});

const plan = result.output ?? {
  summary: result.text,
  nextSteps: [],
};
```

Use `outputSchema` for validation; do not parse model text manually unless there is no schema path available.

## Structured Streaming

Use `structured` when the client should receive object updates, not only final text.

```ts
const DraftSchema = z.object({
  draft: z.object({
    subject: z.string().min(1),
    body: z.string().min(1),
    bullets: z.array(z.string().min(1)).default([]),
  }),
});

type Draft = z.infer<typeof DraftSchema>;

const result = await useReason<Draft>({
  id: "compose-email",
  model,
  system: "Return JSON only.",
  input: "Write a customer-facing beta launch email.",
  outputSchema: DraftSchema,
  stream: true,
  emit: true,
  structured: {
    dataType: "email.compose",
    schemaId: "email-draft",
    schemaVersion: "1",
    stream: true,
    fields: {
      "draft.subject": "set",
      "draft.body": "text-delta",
      "draft.bullets": "append",
    },
  },
});
```

Field modes:

- `set`: emit a completed field-path value.
- `text-delta`: emit string deltas for a string field path.
- `append`: emit completed items for an array field path.

`structured.fields` supports literal nested paths, numeric array segments, and single-segment `*` patterns such as `assessment_points.*.criteria_label`. Wildcard matches emit concrete paths such as `assessment_points.commercial_resilience.criteria_label`; recursive `**` patterns are not supported.

With `outputSchema` or `interrupt`, Kortyx suppresses raw assistant `text-delta` chunks because the raw stream is partial JSON. This does not mean structured output is not streaming: configured fields stream as `structured-data` chunks such as `{ kind: "text-delta", path: "draft.body", delta }`, `{ kind: "append", path, items }`, and `{ kind: "set", path, value }`.

If `structured` is provided without `fields`, Kortyx emits the final structured object when parsing and validation succeed.

## Interrupt Mode

Use `interrupt` when the model should produce a structured request for human input, then continue after the user responds.

```ts
const ChoiceRequestSchema = z.object({
  kind: z.enum(["choice", "multi-choice"]),
  question: z.string().min(1),
  options: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
    }),
  ),
});

const ChoiceResponseSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)),
]);

const result = await useReason<Plan, z.infer<typeof ChoiceRequestSchema>, z.infer<typeof ChoiceResponseSchema>>({
  id: "plan-with-choice",
  model,
  system: "Return JSON only.",
  input: "Create a plan and ask the user to choose a priority.",
  outputSchema: PlanSchema,
  interrupt: {
    schemaId: "priority-choice",
    schemaVersion: "1",
    requestSchema: ChoiceRequestSchema,
    responseSchema: ChoiceResponseSchema,
  },
});

const choice = result.interruptResponse;
```

Interrupt/resume can replay node code. Give the reason call a stable `id`, and keep side effects before it idempotent or guarded with node/workflow state.

## Prompting Rules

- Put stable behavior in `system`.
- Put task-specific user/request content in `input`.
- Make structured-output prompts explicit: "Return JSON only" and describe the desired fields.
- Do not ask the model to perform deterministic business writes. Call app services directly after validation.
- Keep untrusted client context out of `system`; derive sensitive context on the server.
- For multilingual replies, avoid embedding raw ISO codes ("Respond in language code: en"). Models occasionally echo the code as a literal token before their answer. Use the display name instead — `new Intl.DisplayNames(["en"], { type: "language" }).of(code)` gives "English", "French", etc. and produces stable phrasings like "Respond in English." Belt-and-braces: append "Output plain text/markdown only — no language codes, no labels." when the prompt is otherwise terse.

## Debugging

Inspect these first:

- `result.warnings`: unsupported options or provider compatibility issues.
- `result.raw`: provider-native payload.
- `result.providerMetadata`: provider-specific normalized details.
- `result.usage`: token accounting.
- `result.finishReason`: stop, length, tool/provider stop, or other completion reason.

If the UI is not streaming, check both provider streaming (`stream`) and Kortyx emission (`emit`), then verify the route returns SSE and the client renders active stream pieces.

## Avoid

- Calling `useReason(...)` outside Kortyx node execution.
- Calling providers directly from UI/client code.
- Omitting `id` when a node has multiple reason calls or interrupt/resume behavior.
- Returning `ui.message` with the same text that `useReason({ emit: true })` already streamed.
- Trusting client-sent context for authorization.
- Hand-parsing JSON that should be validated by `outputSchema`.
- Using structured streaming for deterministic UI updates that belong in `useStructuredData(...)`.
