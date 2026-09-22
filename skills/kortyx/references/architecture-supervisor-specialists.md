# Coordinator And Specialist Architecture

Use this shape for conversational agents that can perform several kinds of work.
The root coordinator chooses a workflow for the current turn; a registered child
specialist does the work and returns; the coordinator produces or forwards the
user-facing answer.

## Recommended Shape

1. A coordinator node classifies the current turn using explicit app rules or a
   small model call.
2. It calls the selected registered specialist with `useWorkflow(...)` and a
   stable call id.
3. The specialist normally uses one `useReason(...)` operation with its local or
   MCP-derived tools and, when needed, model-driven interrupt contracts.
4. The specialist reaches `__end__` with schema-validated data. `useWorkflow`
   returns that data to the coordinator.
5. The coordinator returns a natural response and retains ownership of the
   top-level conversation.

Use `transitionTo` only for a true root handoff that should not return. Do not use
it for a specialist whose result the coordinator needs.

```ts
import { google } from "@kortyx/google";
import {
  defineInterruptContract,
  defineWorkflow,
  useReason,
  useWorkflow,
} from "kortyx";
import { z } from "zod";

const ResearchInput = z.object({ question: z.string() });
const ResearchOutput = z.object({ answer: z.string() });

const chooseSource = defineInterruptContract({
  description: "Ask which source scope to use when the request is ambiguous.",
  schemaId: "acme.source-scope",
  schemaVersion: "1",
  requestSchema: z.object({
    question: z.string(),
    choices: z.array(z.object({ id: z.string(), label: z.string() })),
  }),
  responseSchema: z.object({ id: z.string() }),
});

export const researchWorkflow = defineWorkflow({
  id: "research",
  version: "1",
  inputSchema: ResearchInput,
  outputSchema: ResearchOutput,
  nodes: {
    research: {
      run: async ({ input }) => {
        const result = await useReason({
          id: "research",
          model: google("gemini-2.5-flash"),
          system: "Research the request and answer in clear conversational prose.",
          input: input.question,
          stream: false,
          emit: false,
          tools: [searchTool, readDocumentTool],
          interrupts: {
            mode: "optional",
            maxRequests: 1,
            contracts: { chooseSource },
          },
          toolExecution: { maxSteps: 6 },
        });
        return { data: { answer: result.text } };
      },
    },
  },
  edges: [["__start__", "research"], ["research", "__end__"]],
});

async function coordinatorNode({ input }: { input: { text: string } }) {
  const result = await useWorkflow({
    id: "research-for-turn",
    workflow: researchWorkflow,
    input: { question: input.text },
  });
  return { data: result.data, ui: { message: result.data.answer } };
}
```

Register the coordinator and every callable specialist on the same agent. Keep
specialist input/output schemas narrow and pass only business data needed for the
call. Authentication and tenant scope still come from server-owned runtime context
and tool implementations.

## Let `useReason` Own The Model Loop

Pass `KortyxExecutableTool[]` and interrupt contracts to one `useReason` call. The
runtime already handles model passes, tool results, approval pauses, contract
responses, replay, budgets, cancellation, cleanup, and telemetry.

Avoid custom state machines that repeatedly call a provider, parse invented tool
commands, append messages, or manually re-enter after human input. They bypass the
runtime's checkpoint and execution contracts. Split work into multiple reason
operations only when the phases have genuinely different prompts, schemas, model
policies, or visibility—not merely to recreate a tool loop.

## Prompt And Tool-Description Boundaries

- The system prompt owns role, task policy, decision criteria, safety rules, and
  desired user-facing style.
- Each tool `description` explains when that capability is useful and what it
  returns. Its `inputSchema` explains arguments. Keep both concise and stable.
- Tool code owns authorization, input validation, business invariants, and external
  writes. A prompt or schema is not an access-control boundary.
- Do not put secrets, per-request credentials, raw user history, or changing runtime
  state in tool names, descriptions, denial codes, or telemetry metadata.
- Do not duplicate the whole system prompt in every tool description. Do not make
  the prompt enumerate brittle call sequences when the model may choose naturally.

## Natural Conversational Output

Ask specialists to answer the user's intent, not narrate framework mechanics. Final
responses should not mention workflow ids, tool names, schema validation, model
passes, interrupt contracts, or internal routing unless the user is debugging them.
Prefer a direct answer in natural prose; use lists or structured UI only when they
make the content easier to use. Avoid canned progress narration and do not expose a
raw tool result as the final response without converting it to user-facing language.

If a specialist returns structured data rather than final prose, let the coordinator
format it once. Do not stream the specialist text and then emit the same text again
through `ui.message`.
