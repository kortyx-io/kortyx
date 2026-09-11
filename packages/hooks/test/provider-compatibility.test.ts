import type { ModelOptions, ProviderSelector } from "@kortyx/providers";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createProvider as anthropic } from "../../../providers/anthropic/src";
import { createProvider as deepseek } from "../../../providers/deepseek/src";
import { createProvider as google } from "../../../providers/google/src";
import { createProvider as groq } from "../../../providers/groq/src";
import { createProvider as mistral } from "../../../providers/mistral/src";
import {
  responseStream,
  testModels,
  textResponse,
  toolResponse,
  type Vendor,
} from "../../../providers/test-compatibility";
import { runWithHookContext } from "../src/context";
import { useReason } from "../src/hooks";
import { createNode, createState } from "./helpers";

const factories: Record<
  Vendor,
  (settings: { apiKey: string; fetch: typeof fetch }) => ProviderSelector
> = { anthropic, google, deepseek, groq, mistral };
const schema = z.object({ value: z.number() });
const prompt = "Look up two values, then return their sum.";
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

describe("useReason with native provider fixtures", () => {
  for (const vendor of Object.keys(factories) as Vendor[]) {
    it(`${vendor}: root cancellation reaches tools and prevents another model pass`, async () => {
      let calls = 0;
      const controller = new AbortController();
      const provider = factories[vendor]({
        apiKey: "fixture",
        fetch: async (_url, init) => {
          calls++;
          expect(init?.signal?.aborted).toBe(false);
          return json(toolResponse(vendor));
        },
      });
      const { node } = createNode();
      node.abortSignal = controller.signal;
      await expect(
        runWithHookContext({ node, state: createState() }, () =>
          useReason({
            model: provider(testModels[vendor]),
            input: prompt,
            stream: false,
            tools: [
              {
                name: "lookup",
                inputSchema: {},
                execute: (_input, context) => {
                  controller.abort();
                  expect(context.abortSignal?.aborted).toBe(true);
                  return "cancelled";
                },
              },
            ],
          }),
        ),
      ).rejects.toThrow();
      expect(calls).toBe(1);
    });
    it(`${vendor}: approval resume replays private state without rerunning the model`, async () => {
      let calls = 0;
      const provider = factories[vendor]({
        apiKey: "fixture",
        fetch: async (_url, init) => {
          calls++;
          if (calls > 1 && vendor !== "groq")
            expect(String(init?.body)).toContain("private-state-1");
          return json(
            calls === 1
              ? toolResponse(vendor)
              : textResponse(vendor, '{"value":3}'),
          );
        },
      });
      const state = createState();
      const { node } = createNode({
        onInterrupt: () => {
          throw new Error("pending approval");
        },
      });
      const execute = vi.fn(async () => "3");
      const run = () =>
        useReason({
          id: "approved",
          model: provider(testModels[vendor]),
          input: prompt,
          stream: false,
          reasoning: { effort: "high" },
          outputSchema: schema,
          tools: [{ name: "lookup", inputSchema: {}, execute }],
          toolExecution: { approval: true, maxSteps: 3 },
        });
      await expect(runWithHookContext({ node, state }, run)).rejects.toThrow(
        "pending approval",
      );
      expect(calls).toBe(1);
      expect(execute).not.toHaveBeenCalled();
      const { node: resumed } = createNode({ interruptResponse: "approve" });
      const { result } = await runWithHookContext(
        { node: resumed, state },
        run,
      );
      expect(result.output).toEqual({ value: 3 });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(calls).toBe(2);
    });
    it.each([
      false,
      true,
    ])(`${vendor}: two tool rounds, schema output and usage (stream=%s)`, async (stream) => {
      const requests: Record<string, unknown>[] = [];
      const controller = new AbortController();
      const provider = factories[vendor]({
        apiKey: "fixture",
        fetch: async (_url, init) => {
          expect(init?.signal).toBeDefined();
          const body = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          requests.push(body);
          if (requests.length > 1 && vendor !== "groq")
            expect(JSON.stringify(body)).toContain("private-state-1");
          const response =
            requests.length <= 2
              ? toolResponse(vendor, requests.length)
              : textResponse(
                  vendor,
                  vendor === "groq" && requests.length === 3
                    ? "The sum is 3."
                    : '{"value":3}',
                );
          const isStream =
            vendor === "google"
              ? String(_url).includes("streamGenerateContent")
              : body.stream === true;
          return isStream ? responseStream(vendor, response) : json(response);
        },
      });
      const { node, emitted } = createNode();
      node.abortSignal = controller.signal;
      const consume = vi.fn();
      node.consumeExecution = consume;
      const execute = vi.fn(async (_input, context) => {
        expect(context.abortSignal).toBeDefined();
        return { value: execute.mock.calls.length };
      });
      const { result } = await runWithHookContext(
        { node, state: createState() },
        () =>
          useReason({
            id: "lookup",
            model: provider(testModels[vendor]),
            input: prompt,
            stream,
            reasoning: { effort: "high" },
            outputSchema: schema,
            tools: [
              {
                name: "lookup",
                inputSchema: {
                  type: "object",
                  properties: { key: { type: "string" } },
                },
                execute,
              },
            ],
            toolExecution: { maxSteps: 5 },
          }),
      );
      const passes = vendor === "groq" ? 4 : 3;
      expect(result.output).toEqual({ value: 3 });
      expect(execute).toHaveBeenCalledTimes(2);
      expect(requests).toHaveLength(passes);
      expect(result.usage).toMatchObject({
        input: 10 * passes,
        output: 5 * passes,
        total: 15 * passes,
      });
      expect(
        consume.mock.calls.filter(([limit]) => limit === "maxModelPasses"),
      ).toHaveLength(passes);
      expect(JSON.stringify(emitted)).not.toMatch(
        /private-state|signature-1|redacted-1/,
      );
      if (vendor === "groq") {
        expect(requests[0]).not.toHaveProperty("response_format");
        expect(requests.at(-1)).toMatchObject({
          stream: false,
          response_format: { type: "json_schema" },
          reasoning_effort: "high",
        });
        expect(requests.at(-1)).not.toHaveProperty("tools");
      }
    });
  }
  it("resumes Groq finalization without repeating tools or double-counting usage", async () => {
    let calls = 0;
    const provider = groq({
      apiKey: "fixture",
      fetch: async () =>
        json(
          ++calls === 1
            ? toolResponse("groq")
            : textResponse(
                "groq",
                calls === 2 ? "The answer is 3." : '{"value":3}',
              ),
        ),
    });
    const execute = vi.fn(async () => ({ value: 3 }));
    const state = createState();
    const { node } = createNode();
    let passes = 0;
    node.consumeExecution = (limit) => {
      if (limit === "maxModelPasses" && ++passes === 3)
        throw new Error("test model limit");
    };
    const run = () =>
      useReason({
        id: "resume",
        model: provider("openai/gpt-oss-120b", {
          reasoning: { effort: "high" },
        }),
        input: prompt,
        stream: false,
        outputSchema: schema,
        tools: [{ name: "lookup", inputSchema: {}, execute }],
        toolExecution: { maxSteps: 3 },
      });
    await expect(runWithHookContext({ node, state }, run)).rejects.toThrow(
      "test model limit",
    );
    expect(calls).toBe(2);
    const { node: resumed } = createNode();
    const { result, runtimeUpdates } = await runWithHookContext(
      { node: resumed, state },
      run,
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(calls).toBe(3);
    expect(result.output).toEqual({ value: 3 });
    expect(result.usage?.total).toBe(45);
    expect(runtimeUpdates?.tokenUsage).toMatchObject({ total: 45 });
  });
  it("counts finalization against maxSteps and does not execute an extra request", async () => {
    let calls = 0;
    const provider = groq({
      apiKey: "fixture",
      fetch: async () =>
        json(
          ++calls === 1 ? toolResponse("groq") : textResponse("groq", "done"),
        ),
    });
    const { node } = createNode();
    await expect(
      runWithHookContext({ node, state: createState() }, () =>
        useReason({
          model: provider("openai/gpt-oss-120b"),
          input: prompt,
          stream: false,
          outputSchema: schema,
          tools: [{ name: "lookup", inputSchema: {}, execute: () => "3" }],
          toolExecution: { maxSteps: 2 },
        }),
      ),
    ).rejects.toThrow("maxSteps (2)");
    expect(calls).toBe(2);
  });
  it("keeps provider defaults when a call overrides another option in its namespace", async () => {
    const requests: ModelOptions[] = [];
    const provider = groq({
      apiKey: "fixture",
      fetch: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return json(
          requests.length === 1
            ? toolResponse("groq")
            : textResponse("groq", '{"value":3}'),
        );
      },
    });
    const { node } = createNode();
    await runWithHookContext({ node, state: createState() }, () =>
      useReason({
        model: provider("openai/gpt-oss-120b", {
          providerOptions: { groq: { structuredOutputs: false } },
        }),
        providerOptions: { groq: { serviceTier: "on_demand" } },
        input: prompt,
        stream: false,
        outputSchema: schema,
        tools: [{ name: "lookup", inputSchema: {}, execute: () => "3" }],
      }),
    );
    expect(requests).toHaveLength(2);
  });
});
