// biome-ignore-all lint/correctness/useHookAtTopLevel: Server workflow hooks in isolated E2E fixtures.

import { projectWorkflowTopology } from "@kortyx/agent";
import { createKortyxTelemetryAdapter } from "@kortyx/telemetry";
import { expect, test } from "@playwright/test";
import {
  createAgent,
  createInMemoryFrameworkAdapter,
  defineWorkflow,
  useInterrupt,
  useReason,
  useTool,
} from "kortyx";
import { z } from "zod";

const workflowId = "e2e-use-tool-workflow";
const apiUrl = process.env.KORTYX_API_URL ?? "http://localhost:6400";
const apiKey =
  process.env.KORTYX_TELEMETRY_API_KEY ??
  "ktyx_test_localtelemetry_oss-demo-telemetry-secret-change-me";
let runId: string;

test.beforeAll(async () => {
  const tool = {
    name: "read_job_knowledge",
    description: "Read job information",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
    outcomes: {
      denialCodes: ["JOB_INFORMATION_UNAVAILABLE"],
      classifyResult: () => ({
        outcome: "denied" as const,
        code: "JOB_INFORMATION_UNAVAILABLE",
      }),
    },
    execute: (_input: { jobId: string }) => ({
      status: "DENIED",
      private: "E2E_PRIVATE_RESULT",
    }),
  };
  const workflow = defineWorkflow({
    id: workflowId,
    version: "1",
    inputSchema: z.object({}),
    outputSchema: z.object({ status: z.string() }),
    nodes: {
      lookup: {
        run: async () => {
          await useTool({ tool, input: { jobId: "E2E_PRIVATE_INPUT" } });
          return { data: { status: "OK" } };
        },
      },
    },
    edges: [
      ["__start__", "lookup"],
      ["lookup", "__end__"],
    ],
  });
  const telemetry = createKortyxTelemetryAdapter({
    endpoint: apiUrl,
    apiKey,
    environment: "test",
    service: { name: "isolated-use-tool-e2e" },
  });
  const snapshot = projectWorkflowTopology({
    workflow,
    environment: "test",
    service: { name: "isolated-use-tool-e2e" },
  });
  const catalogNode = snapshot.workflow.nodes[0];
  if (!catalogNode || !telemetry.reporter)
    throw new Error("Expected concrete topology and reporter");
  catalogNode.tools = [
    {
      name: tool.name,
      description: tool.description,
      callingMode: "direct",
      provenance: "source",
      inputFields: [{ name: "jobId", type: "string", required: true }],
    },
  ];
  catalogNode.toolDiscovery = {
    status: "unresolved",
    publishedAt: new Date().toISOString(),
    warnings: ["Dynamic attachments cannot be fully resolved"],
  };
  await telemetry.reporter.ensureWorkflowTopology(snapshot);
  const result = await createAgent({
    workflows: [workflow],
    telemetry,
    frameworkAdapter: createInMemoryFrameworkAdapter(),
  }).execute({ workflow, input: {} });
  expect(result.status).toBe("completed");
  runId = result.runId;
  await telemetry.flush();
});

test("a replay links to the selected original attempt in Trace", async ({
  page,
}) => {
  let executions = 0;
  const responses = [
    {
      content: "",
      toolCalls: [{ id: "cached", name: "cached_lookup", input: {} }],
    },
    { content: "Handled." },
  ];
  const provider = {
    id: "isolated-provider",
    models: ["deterministic"],
    getModel: () => ({
      invoke: async () => {
        const response = responses.shift();
        if (!response) throw new Error("Unexpected provider call on replay");
        return response;
      },
      stream: async function* () {},
    }),
  };
  const telemetry = createKortyxTelemetryAdapter({
    endpoint: apiUrl,
    apiKey,
    environment: "test",
    service: { name: "isolated-cache-e2e" },
  });
  const workflow = defineWorkflow({
    id: "e2e-tool-replay",
    version: "1",
    inputSchema: z.object({}),
    outputSchema: z.object({ status: z.string() }),
    nodes: {
      lookup: {
        run: async () => {
          await useReason({
            id: "cached-reason",
            model: { provider, modelId: "deterministic" },
            input: "Check access",
            stream: false,
            emit: false,
            tools: [
              {
                name: "cached_lookup",
                inputSchema: {},
                outcomes: {
                  denialCodes: ["ACCESS_DENIED"],
                  classifyResult: () => ({
                    outcome: "denied",
                    code: "ACCESS_DENIED",
                  }),
                },
                execute: () => {
                  executions++;
                  return { status: "DENIED" };
                },
              },
            ],
          });
          await useInterrupt({
            id: "continue",
            request: { kind: "text", question: "Continue?" },
          });
          return { data: { status: "OK" } };
        },
      },
    },
    edges: [
      ["__start__", "lookup"],
      ["lookup", "__end__"],
    ],
  });
  const agent = createAgent({
    workflows: [workflow],
    telemetry,
    frameworkAdapter: createInMemoryFrameworkAdapter(),
  });
  const first = await agent.execute({ workflow, input: {} });
  expect(first.status).toBe("suspended");
  const checkpoint = (await agent.listCheckpoints(first.sessionId))[0];
  const fork = await agent.fork(checkpoint.id, {
    newSessionId: "e2e-tool-replay-fork",
  });
  const pending = fork.checkpoint.activePendingRequests[0];
  const resumed = await agent.resume({
    workflow,
    resume: {
      token: pending.token,
      requestId: pending.requestId,
      runId: pending.runId,
      sessionId: fork.sessionId,
    },
    response: { type: "text", text: "continue" },
  });
  expect(resumed.status).toBe("completed");
  expect(executions).toBe(1);
  await telemetry.flush();
  await page.goto(`/runs/${resumed.runId}?env=test&tab=trace`);
  await page.getByRole("button", { name: /cached_lookup.*Replayed/ }).click();
  const original = page.getByRole("link", {
    name: "Original execution",
    exact: true,
  });
  await expect(original).toHaveAttribute("href", /tab=trace&env=test/);
  await original.click();
  await expect(page).toHaveURL(new RegExp(`/runs/${first.runId}\\?`));
  await expect(
    page.getByRole("button", { name: "Close item details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /cached_lookup.*Denied/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("body")).toContainText(
    "Model-selected call from lookup · ACCESS_DENIED",
  );
});

test("discovers tools in workflow search, inspects capabilities, and drills into a denial in a successful run", async ({
  page,
}) => {
  await page.goto(
    `/workflows?workflow=${workflowId}&env=test&range=7+days&version=1`,
  );
  await page
    .getByPlaceholder("Search workflows or tools…")
    .fill("read_job_knowledge");
  await expect(
    page.getByRole("button", { name: new RegExp(workflowId) }).first(),
  ).toBeVisible();
  const tools = page.getByRole("region", { name: "Attached tools" });
  await expect(tools).toBeVisible();
  await tools
    .locator("summary")
    .filter({ hasText: "read_job_knowledge" })
    .click();
  await expect(tools).toContainText("Called directly");
  await expect(tools).toContainText("1 denied");
  await expect(tools).toContainText("1 executions");
  await expect(tools).toContainText("Dynamic attachments");
  await expect(tools).toContainText("jobId");
  await expect(page.locator("body")).not.toContainText("E2E_PRIVATE");
  const link = tools.getByRole("link", { name: "Denials", exact: true });
  const href = await link.getAttribute("href");
  expect(href).toContain("env=test");
  expect(href).toContain("version=1");
  expect(href).toContain("toolOutcome=denied");
  await link.click();
  await expect(page.locator('[data-table-ready="true"]')).toBeVisible();
  await expect(page.locator(`[data-row-key="${runId}"]`)).toBeVisible();
  await page
    .locator(`[data-row-key="${runId}"]`)
    .click({ position: { x: 8, y: 8 } });
  await expect(page.locator("[data-detail-drawer]").last()).toContainText(
    "completed",
  );
  await expect(
    page.getByText("No model requests", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Tool executions", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trace", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /read_job_knowledge.*Denied/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /read_job_knowledge.*Denied/ })
    .click();
  await expect(page.locator("body")).toContainText(
    "JOB_INFORMATION_UNAVAILABLE",
  );
  await expect(page.locator("body")).not.toContainText("E2E_PRIVATE");
});
