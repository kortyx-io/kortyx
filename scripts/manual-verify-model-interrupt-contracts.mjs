import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(resolve(root, "packages/hooks/package.json"));
const { z } = require("zod");
const { defineWorkflow } = require(
  resolve(root, "packages/core/dist/index.js"),
);
const { defineInterruptContract, useReason } = require(
  resolve(root, "packages/hooks/dist/index.js"),
);
const { createInMemoryFrameworkAdapter } = require(
  resolve(root, "packages/runtime/dist/index.js"),
);
const { createAgent } = require(resolve(root, "packages/agent/dist/index.js"));

const candidates = [
  { jobId: "job-1", title: "Platform Engineer" },
  { jobId: "job-2", title: "Frontend Engineer" },
  { jobId: "job-3", title: "Data Engineer" },
];
const modelResponses = [
  {
    content: "",
    toolCalls: [
      { id: "search", name: "search_jobs", input: { country: "France" } },
    ],
  },
  {
    content: "",
    toolCalls: [
      {
        id: "pick",
        name: "kortyx_request_input__jobPicker",
        input: { question: "Which engineering job?", candidates },
      },
    ],
  },
  {
    content: "",
    toolCalls: [{ id: "read", name: "read_job", input: { jobId: "job-2" } }],
  },
  { content: "The Frontend Engineer role is based in Paris." },
];
const provider = {
  id: "manual-fixture",
  models: ["fixture"],
  getModel: () => ({
    invoke: async () => {
      const response = modelResponses.shift();
      if (!response) throw new Error("No fixture response remains.");
      return response;
    },
    stream: async function* () {},
  }),
};
let searchCalls = 0;
let readCalls = 0;
const jobPicker = defineInterruptContract({
  description: "Ask the user to choose between matching jobs.",
  schemaId: "wolly.job-picker",
  schemaVersion: "1",
  requestSchema: z.object({
    question: z.string(),
    candidates: z.array(z.object({ jobId: z.string(), title: z.string() })),
  }),
  responseSchema: z.object({
    type: z.literal("select"),
    jobId: z.string(),
  }),
});
const workflow = defineWorkflow({
  id: "manual-interrupt-contract",
  version: "1",
  inputSchema: z.object({ request: z.string() }),
  outputSchema: z.object({ answer: z.string() }),
  nodes: {
    brief: {
      run: async ({ input }) => {
        const result = await useReason({
          id: "brief",
          model: { provider, modelId: "fixture" },
          input: input.request,
          stream: false,
          emit: false,
          tools: [
            {
              name: "search_jobs",
              inputSchema: {},
              execute: async () => {
                searchCalls += 1;
                return candidates;
              },
            },
            {
              name: "read_job",
              inputSchema: {},
              execute: async () => {
                readCalls += 1;
                return { jobId: "job-2", city: "Paris" };
              },
            },
          ],
          interrupts: {
            mode: "optional",
            maxRequests: 2,
            contracts: { jobPicker },
          },
          toolExecution: { maxSteps: 6 },
        });
        return { data: { answer: result.text } };
      },
    },
  },
  edges: [
    ["__start__", "brief"],
    ["brief", "__end__"],
  ],
});
const frameworkAdapter = createInMemoryFrameworkAdapter();
const agent = createAgent({ workflows: [workflow], frameworkAdapter });
const first = await agent.execute({
  workflow,
  input: { request: "Tell me about the engineering job in France." },
});
assert.equal(first.status, "suspended");
assert.equal(first.interrupt.input.kind, "custom");
assert.equal(first.interrupt.input.contract, "jobPicker");
assert.deepEqual(first.interrupt.input.request, {
  question: "Which engineering job?",
  candidates,
});
console.log("PASS search_jobs -> structured job-picker interrupt");

const final = await agent.resume({
  workflow,
  resume: first.resume,
  response: {
    type: "value",
    value: { type: "select", jobId: "job-2" },
  },
});
assert.equal(final.status, "completed");
assert.deepEqual(final.data, {
  answer: "The Frontend Engineer role is based in Paris.",
});
assert.equal(searchCalls, 1);
assert.equal(readCalls, 1);
assert.equal(modelResponses.length, 0);
console.log("PASS structured response -> read_job -> grounded final answer");
console.log("PASS search tool was not replayed after resume");
