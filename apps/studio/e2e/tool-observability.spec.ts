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

test("automatically renders thrown and returned tool faults in a completed workflow", async ({
  page,
}) => {
  const responses = [
    {
      content: "",
      toolCalls: [
        {
          id: "native-fault",
          name: "search_jobs",
          input: { private: "E2E_PRIVATE_INPUT" },
        },
      ],
    },
    { content: "Handled." },
  ];
  const provider = {
    id: "fault-provider",
    models: ["deterministic"],
    getModel: () => ({
      invoke: async () => {
        const response = responses.shift();
        if (!response) throw new Error("Unexpected provider call");
        return response;
      },
      stream: async function* () {},
    }),
  };
  const telemetry = createKortyxTelemetryAdapter({
    endpoint: apiUrl,
    apiKey,
    environment: "test",
    service: { name: "fault-e2e" },
  });
  const error = Object.assign(new TypeError("list_jobs database unavailable"), {
    cause: new Error("E2E_PRIVATE_CAUSE"),
    secret: "E2E_PRIVATE_FIELD",
  });
  const workflow = defineWorkflow({
    id: "e2e-tool-fault-diagnostics",
    version: "1",
    inputSchema: z.object({}),
    outputSchema: z.object({ status: z.string() }),
    nodes: {
      lookup: {
        run: async () => {
          try {
            await useTool({
              tool: {
                name: "list_jobs",
                inputSchema: {},
                execute: () => {
                  throw error;
                },
              },
              input: { private: "E2E_PRIVATE_INPUT" },
            });
          } catch (caught) {
            expect(caught).toBe(error);
          }
          await useReason({
            model: { provider, modelId: "deterministic" },
            input: "Check jobs",
            stream: false,
            emit: false,
            tools: [
              {
                name: "search_jobs",
                inputSchema: {},
                execute: () => ({
                  isError: true,
                  content: "search_jobs upstream unavailable",
                  raw: { secret: "E2E_PRIVATE_RESULT" },
                }),
              },
            ],
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
  const result = await createAgent({
    workflows: [workflow],
    telemetry,
    frameworkAdapter: createInMemoryFrameworkAdapter(),
  }).execute({ workflow, input: {} });
  expect(result.status).toBe("completed");
  await telemetry.flush();
  await page.goto(`/runs/${result.runId}?tab=trace&env=test`);
  for (const [name, type, message] of [
    ["list_jobs", "TypeError", "list_jobs database unavailable"],
    ["search_jobs", "ToolError", "search_jobs upstream unavailable"],
  ] as const) {
    await page
      .getByRole("button", { name: new RegExp(`${name}.*Fault`) })
      .click();
    const inspector = page.getByRole("dialog", { name, exact: true });
    await expect(inspector).toContainText("Error type");
    await expect(inspector).toContainText(type);
    await expect(inspector).toContainText("Error message");
    await expect(inspector).toContainText(message);
    await expect(page.locator("body")).not.toContainText("E2E_PRIVATE");
    await page.keyboard.press("Escape");
  }
});

test("automatically diagnoses provider and invalid JSON errors without capturing model content", async ({
  page,
}) => {
  const telemetry = createKortyxTelemetryAdapter({
    endpoint: apiUrl,
    apiKey,
    environment: "test",
    service: { name: "model-fault-e2e" },
  });
  for (const kind of ["provider", "json"] as const) {
    const error = Object.assign(new TypeError("Provider connection refused"), {
      cause: new Error("E2E_PRIVATE_CAUSE"),
      body: "E2E_PRIVATE_PROVIDER_BODY",
      providerMetadata: { raw: "E2E_PRIVATE_METADATA" },
      usage: { input: 17, output: 2, raw: { body: "E2E_PRIVATE_USAGE" } },
      apiKey: "E2E_PRIVATE_CREDENTIAL",
    });
    const provider = {
      id: "model-fault-provider",
      models: ["deterministic"],
      getModel: () => ({
        invoke: async () => {
          if (kind === "provider") throw error;
          return {
            content: "not JSON E2E_PRIVATE_OUTPUT",
            finishReason: { unified: "stop" as const, raw: "stop" },
          };
        },
        stream: async function* () {},
      }),
    };
    const workflow = defineWorkflow({
      id: `e2e-model-fault-${kind}`,
      version: "1",
      inputSchema: z.object({}),
      outputSchema: z.object({ status: z.string() }),
      nodes: {
        decide: {
          run: async () => {
            try {
              await useReason({
                model: { provider, modelId: "deterministic" },
                input: "E2E_PRIVATE_PROMPT",
                stream: false,
                emit: false,
                outputSchema: z.object({ title: z.string() }),
              });
              throw new Error("Expected a model fault");
            } catch (caught) {
              if (kind === "provider") expect(caught).toBe(error);
              else expect(caught).toMatchObject({ code: "INVALID_MODEL_JSON" });
            }
            return { data: { status: "Handled" } };
          },
        },
      },
      edges: [
        ["__start__", "decide"],
        ["decide", "__end__"],
      ],
    });
    const result = await createAgent({
      workflows: [workflow],
      telemetry,
      frameworkAdapter: createInMemoryFrameworkAdapter(),
    }).execute({ workflow, input: {} });
    expect(result.status).toBe("completed");
    await telemetry.flush();
    const response = await page.request.get(
      `${apiUrl}/v1/studio/runs/${result.runId}`,
      {
        headers: {
          authorization: `Bearer ${process.env.KORTYX_STUDIO_API_KEY ?? "ktyx_test_localstudio_oss-demo-studio-secret-change-me"}`,
        },
      },
    );
    expect(response.ok()).toBe(true);
    expect(await response.text()).not.toContain("E2E_PRIVATE");
    await page.goto(`/runs/${result.runId}?tab=trace&env=test`);
    const label = kind === "provider" ? "deterministic" : "Model reasoning";
    await page
      .getByRole("button", { name: new RegExp(`${label}.*failed`) })
      .click();
    const inspector = page.getByRole("dialog", { name: label, exact: true });
    await expect(inspector).toContainText("Error type");
    await expect(inspector).toContainText(
      kind === "provider" ? "TypeError" : "ValidationError",
    );
    await expect(inspector).toContainText(
      kind === "provider"
        ? "Provider connection refused"
        : "did not produce valid structured output",
    );
    if (kind === "json")
      await expect(inspector).toContainText("INVALID_MODEL_JSON");
    await expect(page.locator("body")).not.toContainText("E2E_PRIVATE");
    await page.keyboard.press("Escape");
  }
});
