import { expect, it } from "vitest";
import { z } from "zod";
import { compilePrompt, definePrompt } from "../src/compiler";
import { type PromptContent, promptHash } from "../src/contracts";
import { promptText, promptVariablesFor } from "../src/template";

it("uses the ordinary compiler to render typed template references and structured values", async () => {
  const variables = z.object({ question: z.string(), context: z.json() });
  const refs = promptVariablesFor<z.infer<typeof variables>>();
  const content: PromptContent = {
    format: "chat",
    messages: [
      {
        role: "user",
        content: promptText`Question: ${refs.question}\nContext: ${refs.context}`,
      },
    ],
    variablesSchema: z.toJSONSchema(variables),
    configSchema: { type: "object" },
    config: {},
    dependencies: [],
  };
  expect(content.messages[0]?.content).toBe(
    "Question: {{question}}\nContext: {{context}}",
  );
  const result = compilePrompt(
    definePrompt({
      id: "normal",
      format: "chat",
      variables,
      config: z.object({}),
    }),
    { id: "normal", version: 1, hash: await promptHash(content), content },
    { question: "What?", context: { text: "{{question}}", items: [1, 2] } },
    { source: "local", environment: "test", snapshotRevision: "1" },
  );
  expect(result.messages[0]?.content).toBe(
    'Question: What?\nContext: {"items":[1,2],"text":"{{question}}"}',
  );
});
it("handles static values without requiring consumer serialization", () => {
  expect(promptText`A ${"literal"} ${42} ${false} ${null} ${[1, 2]}`).toBe(
    "A literal 42 false null [1,2]",
  );
});
it("rejects implicit reference coercion and unsafe property paths", () => {
  const refs = promptVariablesFor<{ input: string }>();
  expect(() => `${refs.input}`).toThrow(/promptText/);
  expect(() => Reflect.get(refs, "__proto__")).toThrow(/Invalid/);
  expect(() => promptText`${refs}`).toThrow(/named/);
});
