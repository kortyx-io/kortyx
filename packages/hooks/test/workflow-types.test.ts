import { defineWorkflow } from "@kortyx/core";
import { expectTypeOf, it } from "vitest";
import { z } from "zod";
import { parallel } from "../src/parallel";
import { createWorkflowHooks, useWorkflow } from "../src/workflow";

const research = defineWorkflow({
  id: "research",
  version: "1",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ summary: z.string(), sources: z.array(z.string()) }),
  nodes: {},
  edges: [],
});

// Checked by tsc, never executed outside a node context.
async function typeChecks() {
  const { useWorkflow: call } = createWorkflowHooks({ research });
  const [typed, other] = await parallel([
    call({ id: "parallel", workflow: "research", input: { topic: "test" } }),
    Promise.resolve({ count: 1 }),
  ]);
  expectTypeOf(typed.data.sources).toEqualTypeOf<string[]>();
  expectTypeOf(other.count).toEqualTypeOf<number>();
  // @ts-expect-error The tuple preserves each entry's type.
  typed.count;
  const result = await call({
    id: "a",
    workflow: "research",
    input: { topic: "test" },
  });
  expectTypeOf(result.data.summary).toEqualTypeOf<string>();
  expectTypeOf(result.data.sources).toEqualTypeOf<string[]>();
  // @ts-expect-error Unknown result field.
  result.data.missing;
  // @ts-expect-error Input belongs to the selected workflow.
  await call({ id: "a", workflow: "research", input: { topic: 123 } });
  // @ts-expect-error Only registered workflow keys are accepted.
  await call({ id: "a", workflow: "missing", input: { topic: "test" } });
  const reference = await useWorkflow({
    id: "a",
    workflow: research,
    input: { topic: "test" },
  });
  expectTypeOf(reference.data.summary).toEqualTypeOf<string>();
  // @ts-expect-error Typed references check inputs too.
  await useWorkflow({ id: "a", workflow: research, input: { wrong: true } });
}

it("exposes inferred input and output contracts", () => {
  expectTypeOf(typeChecks).toBeFunction();
});
