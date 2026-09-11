import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createProvider as anthropic } from "../../../providers/anthropic/src";
import { createProvider as google } from "../../../providers/google/src";
import { createProvider as groq } from "../../../providers/groq/src";
import {
  textResponse,
  toolResponse,
} from "../../../providers/test-compatibility";
import { runWithHookContext } from "../src/context";
import { useReason } from "../src/hooks";
import { createNode, createState } from "./helpers";

it("applies per-call reasoning overrides before tool capability detection", async () => {
  let calls = 0;
  const provider = anthropic({
    apiKey: "fixture",
    fetch: async (_url, init) => {
      calls++;
      expect(JSON.parse(String(init?.body)).thinking).toEqual({
        type: "disabled",
      });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
        }),
      );
    },
  });
  const { result } = await runWithHookContext(
    { node: createNode().node, state: createState() },
    () =>
      useReason({
        model: provider("claude-sonnet-4-5", { reasoning: { maxTokens: 512 } }),
        input: "answer",
        reasoning: { effort: "none" },
        stream: false,
        tools: [{ name: "lookup", inputSchema: {}, execute: () => "ok" }],
      }),
  );
  expect(result.text).toBe("ok");
  expect(calls).toBe(1);
});

it.each([
  "none",
  "call",
  "model",
])("Groq reuses validated output unless native schema is explicit (%s)", async (explicit) => {
  let calls = 0;
  const schema = z.object({ value: z.number().min(1) });
  const provider = groq({
    apiKey: "fixture",
    fetch: async () => {
      calls++;
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: '{"value":3}' }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );
    },
  });
  const { result } = await runWithHookContext(
    { node: createNode().node, state: createState() },
    () =>
      useReason({
        model: provider(
          "openai/gpt-oss-120b",
          explicit === "model"
            ? {
                responseFormat: {
                  type: "json",
                  schema: z.toJSONSchema(schema),
                },
              }
            : undefined,
        ),
        input: "answer",
        stream: false,
        outputSchema: schema,
        ...(explicit === "call"
          ? {
              responseFormat: {
                type: "json" as const,
                schema: z.toJSONSchema(schema),
              },
            }
          : {}),
        toolExecution: { maxSteps: explicit !== "none" ? 2 : 1 },
        tools: [{ name: "lookup", inputSchema: {}, execute: () => "ok" }],
      }),
  );
  expect(result.output).toEqual({ value: 3 });
  expect(calls).toBe(explicit !== "none" ? 2 : 1);
  expect(result.usage?.total).toBe(calls * 15);
  if (explicit === "none")
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: "responseFormat" }),
      ]),
    );
});

it("fits two Groq tool rounds and a valid answer in the default step budget", async () => {
  let calls = 0;
  const execute = vi.fn(() => ({ value: 3 }));
  const provider = groq({
    apiKey: "fixture",
    fetch: async () =>
      new Response(
        JSON.stringify(
          ++calls <= 2
            ? toolResponse("groq", calls)
            : textResponse("groq", '{"value":3}'),
        ),
      ),
  });
  const { result } = await runWithHookContext(
    { node: createNode().node, state: createState() },
    () =>
      useReason({
        model: provider("openai/gpt-oss-120b"),
        input: "answer",
        stream: false,
        outputSchema: z.object({ value: z.number() }),
        tools: [{ name: "lookup", inputSchema: {}, execute }],
      }),
  );
  expect(result.output).toEqual({ value: 3 });
  expect(execute).toHaveBeenCalledTimes(2);
  expect(calls).toBe(3);
});

it.each([
  { vendor: "google" as const, modelId: "gemini-2.5-flash" },
  { vendor: "google" as const, modelId: "gemini-3-flash-preview" },
  { vendor: "anthropic" as const, modelId: "claude-sonnet-4-6" },
])("separates native schemas from tool selection for $modelId", async ({
  vendor,
  modelId,
}) => {
  const requests: Record<string, unknown>[] = [];
  const provider = (vendor === "google" ? google : anthropic)({
    apiKey: "fixture",
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify(
          requests.length <= 2
            ? toolResponse(vendor, requests.length)
            : textResponse(vendor, '{"value":3}'),
        ),
      );
    },
  });
  const outputSchema = z.object({ value: z.number() });
  const execute = vi.fn(() => ({ value: 3 }));
  const { result } = await runWithHookContext(
    { node: createNode().node, state: createState() },
    () =>
      useReason({
        model: provider(modelId),
        input: "answer",
        stream: false,
        reasoning: { effort: "low" },
        outputSchema,
        responseFormat: { type: "json", schema: z.toJSONSchema(outputSchema) },
        tools: [{ name: "lookup", inputSchema: {}, execute }],
        toolExecution: { maxSteps: 4 },
      }),
  );
  expect(result.output).toEqual({ value: 3 });
  expect(execute).toHaveBeenCalledTimes(2);
  expect(requests.length).toBe(4);
  const field = vendor === "google" ? "generationConfig" : "output_config";
  const schemaField = vendor === "google" ? "responseJsonSchema" : "format";
  for (const request of requests.slice(0, 3))
    expect(request[field] ?? {}).not.toHaveProperty(schemaField);
  expect(requests[3]?.[field]).toHaveProperty(schemaField);
  expect(requests[3]).not.toHaveProperty("tools");
});

it("validates normalized Anthropic schemas against original constraints locally", async () => {
  const fetcher = vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(
      body.output_config.format.schema.properties.value,
    ).not.toHaveProperty("minimum");
    expect(
      body.output_config.format.schema.properties.value.description,
    ).toContain("minimum: 10");
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: '{"value":2}' }],
        stop_reason: "end_turn",
      }),
    );
  });
  const provider = anthropic({ apiKey: "fixture", fetch: fetcher });
  await expect(
    runWithHookContext({ node: createNode().node, state: createState() }, () =>
      useReason({
        model: provider("claude-sonnet-4-6"),
        input: "answer",
        stream: false,
        outputSchema: z.object({ value: z.number().min(10) }),
      }),
    ),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
});
