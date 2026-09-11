import { expect, it } from "vitest";
import { createMessagesRequest, getThinkingRequest } from "../src/messages";
import { normalizeOutputSchema } from "../src/schema";

it.each([
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
])("leaves empty reasoning unchanged on %s", (modelId) => {
  expect(getThinkingRequest({ reasoning: {} }, modelId)).toBeUndefined();
  expect(getThinkingRequest({}, modelId)).toBeUndefined();
});
it.each([
  "minimal",
  "low",
  "medium",
  "high",
])("keeps manual budget stable for %s", (effort) => {
  expect(
    createMessagesRequest(
      "claude-sonnet-4-5",
      [],
      { reasoning: { effort } },
      false,
    ),
  ).toMatchObject({
    thinking: { type: "enabled", budget_tokens: 1024 },
    max_tokens: 2048,
  });
  expect(
    getThinkingRequest(
      { reasoning: { effort, maxTokens: 4096 } },
      "claude-sonnet-4-5",
    ),
  ).toMatchObject({ budget_tokens: 4096 });
});
it("normalizes nested schemas without changing property names or enum values", () => {
  const schema = {
    type: "object",
    properties: {
      minimum: {
        type: "integer",
        minimum: 10,
        maximum: 20,
        description: "Count",
      },
      pattern: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 2, pattern: "^x" },
      },
      choice: {
        anyOf: [
          { type: "string", format: "email" },
          { type: "string", format: "custom" },
        ],
      },
      literal: { enum: [{ minimum: 7 }], const: { maxLength: 5 } },
      reference: { $ref: "#/$defs/value" },
    },
    $defs: { value: { type: "number", exclusiveMinimum: 0 } },
  };
  const original = JSON.stringify(schema);
  const normalized = normalizeOutputSchema(schema);
  expect(normalized.changed).toBe(true);
  expect(normalized.schema).toMatchObject({
    additionalProperties: false,
    properties: {
      minimum: {
        type: "integer",
        description: "Count\nAdditional constraints: minimum: 10; maximum: 20",
      },
      literal: { enum: [{ minimum: 7 }], const: { maxLength: 5 } },
      reference: { $ref: "#/$defs/value" },
      choice: {
        anyOf: [
          { type: "string", format: "email" },
          {
            type: "string",
            description: 'Additional constraints: format: "custom"',
          },
        ],
      },
    },
  });
  expect(JSON.stringify(schema)).toBe(original);
  expect(normalizeOutputSchema(normalized.schema).changed).toBe(false);
  expect(normalizeOutputSchema(false)).toEqual({
    schema: false,
    changed: false,
  });
});
