import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createProvider as anthropic } from "../../../providers/anthropic/src";
import { createProvider as google } from "../../../providers/google/src";
import { runWithHookContext } from "../src/context";
import { useReason } from "../src/hooks";
import { createNode, createState } from "./helpers";

// Opt in explicitly and inject keys via the environment; never load .env in CI.
describe.skipIf(process.env.KORTYX_LIVE_PROVIDERS !== "1")(
  "live provider workflows",
  () => {
    for (const vendor of ["anthropic", "google"] as const) {
      for (const stream of [false, true]) {
        const modelId =
          vendor === "anthropic"
            ? stream
              ? "claude-sonnet-4-6"
              : "claude-sonnet-4-5"
            : stream
              ? "gemini-3-flash-preview"
              : "gemini-2.5-flash";
        it(`${vendor} ${modelId}: two dependent tools, constrained output, stream=${stream}`, async () => {
          const key =
            process.env[
              vendor === "anthropic"
                ? "ANTHROPIC_API_KEY"
                : "GOOGLE_GENERATIVE_AI_API_KEY"
            ];
          if (!key)
            throw new Error(
              `Missing ${vendor} API key for explicitly enabled live tests.`,
            );
          const requests: Record<string, unknown>[] = [];
          const provider = (vendor === "anthropic" ? anthropic : google)({
            apiKey: key,
            fetch: async (url, init) => {
              requests.push(JSON.parse(String(init?.body)));
              return fetch(url, init);
            },
          });
          const ticket = randomUUID();
          const executed: string[] = [];
          const tools = [
            {
              name: "get_ticket",
              description:
                "Get the private lookup ticket, needed by read_value.",
              inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
              execute: async () => {
                executed.push("get_ticket");
                return { ticket };
              },
            },
            {
              name: "read_value",
              description:
                "Read the final value using the exact ticket returned by get_ticket.",
              inputSchema: {
                type: "object",
                properties: { ticket: { type: "string" } },
                required: ["ticket"],
                additionalProperties: false,
              },
              execute: async (input: unknown) => {
                expect((input as { ticket: string }).ticket === ticket).toBe(
                  true,
                );
                executed.push("read_value");
                return { value: 73, label: "verified" };
              },
            },
          ];
          const state = createState();
          const initial = createNode({
            onInterrupt: () => {
              throw new Error("awaiting live approval");
            },
          });
          const emitted = initial.emitted;
          const outputSchema = z.object({
            value: z.number().min(50).max(100),
            label: z.string().min(8).max(12),
          });
          const wireSchema = z.toJSONSchema(outputSchema);
          delete wireSchema.$schema;
          const run = () =>
            useReason({
              id: "live-lookup",
              model: provider(modelId),
              input:
                "Call get_ticket, then call read_value with that exact ticket. You must acquire both tool results before answering. Return only the value and label from read_value. Do not invent or infer tool results.",
              stream,
              reasoning: { effort: "low" },
              maxOutputTokens: 4096,
              outputSchema,
              ...(stream
                ? {
                    responseFormat: {
                      type: "json" as const,
                      schema: wireSchema,
                    },
                  }
                : {}),
              tools,
              toolExecution: {
                maxSteps: 4,
                ...(stream
                  ? { approval: { get_ticket: true, read_value: false } }
                  : {}),
              },
              abortSignal: AbortSignal.timeout(120_000),
            });
          if (stream) {
            await expect(
              runWithHookContext({ node: initial.node, state }, run),
            ).rejects.toThrow("awaiting live approval");
            expect(requests.length).toBe(1);
            expect(executed.length).toBe(0);
          }
          const active = stream
            ? createNode({ interruptResponse: "approve" })
            : initial;
          const { result, runtimeUpdates } = await runWithHookContext(
            { node: active.node, state },
            run,
          );
          if (stream) emitted.push(...active.emitted);
          expect(executed).toEqual(["get_ticket", "read_value"]);
          expect(result.output).toEqual({ value: 73, label: "verified" });
          if (stream) {
            expect(requests.length).toBe(4);
            expect(requests.at(-1)).not.toHaveProperty("tools");
          } else {
            expect(requests.length >= 3 && requests.length <= 4).toBe(true);
          }
          expect((result.usage?.total ?? 0) > 0).toBe(true);
          expect(runtimeUpdates?.tokenUsage).toMatchObject({
            total: result.usage?.total,
          });
          expect(JSON.stringify(emitted).includes("thoughtSignature")).toBe(
            false,
          );
          expect(JSON.stringify(emitted).includes('"signature":')).toBe(false);
          if (vendor === "anthropic") {
            expect(requests[0]?.thinking).toEqual(
              stream
                ? { type: "adaptive" }
                : { type: "enabled", budget_tokens: 1024 },
            );
            expect(JSON.stringify(requests[1]).includes('"signature":')).toBe(
              true,
            );
            expect(
              result.warnings?.some(
                (w) => "feature" in w && w.feature === "responseFormat.schema",
              ),
            ).toBe(true);
          } else {
            expect(
              Boolean(
                (requests[0]?.generationConfig as Record<string, unknown>)
                  ?.thinkingConfig,
              ),
            ).toBe(true);
            expect(
              JSON.stringify(requests[1]).includes("thoughtSignature"),
            ).toBe(true);
          }
          const summary = {
            vendor,
            modelId,
            stream,
            passes: requests.length,
            toolCalls: executed.length,
            usage: {
              input: result.usage?.input,
              output: result.usage?.output,
              reasoning: result.usage?.reasoning,
              total: result.usage?.total,
            },
            valid: true,
            approvalResume: stream,
            nativeFinalization: stream,
          };
          writeFileSync(
            join(tmpdir(), `kortyx-live-${vendor}-${stream}-summary.json`),
            JSON.stringify(summary, null, 2),
          );
        }, 150_000);
      }
      it(`${vendor}: root cancellation aborts a live model request`, async () => {
        const key =
          process.env[
            vendor === "anthropic"
              ? "ANTHROPIC_API_KEY"
              : "GOOGLE_GENERATIVE_AI_API_KEY"
          ];
        if (!key) throw new Error(`Missing ${vendor} API key.`);
        const controller = new AbortController();
        let started = 0;
        let aborted = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const provider = (vendor === "anthropic" ? anthropic : google)({
          apiKey: key,
          fetch: async (url, init) => {
            started++;
            init?.signal?.addEventListener(
              "abort",
              () => {
                aborted = true;
              },
              { once: true },
            );
            timer = setTimeout(() => controller.abort(), 500);
            return fetch(url, init);
          },
        });
        const { node } = createNode();
        node.abortSignal = controller.signal;
        try {
          await expect(
            runWithHookContext({ node, state: createState() }, () =>
              useReason({
                model: provider(
                  vendor === "anthropic"
                    ? "claude-sonnet-4-6"
                    : "gemini-3-flash-preview",
                ),
                input:
                  "Explain the proof of the prime number theorem in detail.",
                stream: true,
                reasoning: { effort: "low" },
                maxOutputTokens: 4096,
              }),
            ),
          ).rejects.toThrow();
          expect(started).toBe(1);
          expect(aborted).toBe(true);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }, 15_000);
    }
  },
);
