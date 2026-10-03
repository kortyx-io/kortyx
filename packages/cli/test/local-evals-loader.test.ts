import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const entry = resolve("src/index.ts");

it("the real CLI loads TypeScript/path aliases/env files and reports SDK results without a Studio connection", async () => {
  const directory = await mkdtemp(resolve(".eval-loader-"));
  try {
    await writeFile(resolve(directory, "package.json"), '{"type":"module"}');
    await writeFile(
      resolve(directory, "tsconfig.json"),
      `// TypeScript configuration supports comments.\n${JSON.stringify({
        compilerOptions: { paths: { "@fixture/*": ["./*"] } },
      })}`,
    );
    await writeFile(resolve(directory, ".env"), "EVAL_FIXTURE_VALUE=base\n");
    await writeFile(
      resolve(directory, ".env.local"),
      "EVAL_FIXTURE_VALUE=local\n",
    );
    await writeFile(
      resolve(directory, "evals.ts"),
      'export { evals } from "@fixture/runner";',
    );
    await writeFile(
      resolve(directory, "lazy-helper.ts"),
      'export enum Mode { Ready = "ready" }; export const mode = Mode.Ready;',
    );
    await writeFile(
      resolve(directory, "runner.ts"),
      `
      import { createEvals } from "@kortyx/agent";
      export const evals = createEvals({
        agent: { streamChat() { throw new Error("Unexpected native stream"); } },
        suites: [{ id: "catalog", cases: [
          { id: "visible", steps: [{ message: "Show products", expect: { type: "answer", outputs: [{ schemaId: "app.products" }] } }] },
          { id: "missing", steps: [{ message: "Show receipt", expect: { type: "answer", outputs: [{ schemaId: "app.receipt" }] } }] }
        ] }],
        execute: async () => {
          const helper = await import("@fixture/lazy-helper");
          if (helper.mode !== "ready") throw new Error("Lazy helper failed");
          return { observation: {
          type: "answer", text: process.env.EVAL_FIXTURE_VALUE,
          structured: [{ schemaId: "app.products", status: "done", data: [] }],
        } }; },
      });
    `,
    );
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      NO_COLOR: "1",
      KORTYX_TELEMETRY_API_URL: "http://127.0.0.1:1",
    };
    delete environment.EVAL_FIXTURE_VALUE;
    const run = (...args: string[]) =>
      execute(
        process.execPath,
        [
          "--import",
          "tsx",
          entry,
          "evals",
          "run",
          "--entry",
          "evals.ts",
          ...args,
        ],
        { cwd: directory, env: environment, timeout: 20_000 },
      );
    const { stdout } = await run(
      "--suite",
      "catalog",
      "--case",
      "visible",
      "--json",
    );
    const report = JSON.parse(stdout);
    expect(report.status).toBe("passed");
    expect(report.runs[0].cases[0].steps[0].observation.text).toBe("local");
    const shell = await execute(
      process.execPath,
      [
        "--import",
        "tsx",
        entry,
        "evals",
        "run",
        "--entry",
        "evals.ts",
        "--suite",
        "catalog",
        "--case",
        "visible",
        "--json",
      ],
      {
        cwd: directory,
        env: { ...environment, EVAL_FIXTURE_VALUE: "shell" },
        timeout: 20_000,
      },
    );
    expect(
      JSON.parse(shell.stdout).runs[0].cases[0].steps[0].observation.text,
    ).toBe("shell");
    await expect(run()).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining("app.receipt (any version)"),
    });
    await expect(run("--suite", "missing-suite")).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("Unknown eval suite: missing-suite"),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

it("a native agent and workflow hooks share context with lazy runtime imports in the CLI", async () => {
  const directory = await mkdtemp(resolve(".eval-native-"));
  try {
    await writeFile(
      resolve(directory, "evals.ts"),
      `
      import { createAgent, createEvals } from "@kortyx/agent";
      import { defineWorkflow } from "@kortyx/core";
      import { createInMemoryFrameworkAdapter } from ${JSON.stringify(resolve("../runtime/dist/index.js"))};
      import { useRuntimeContext } from ${JSON.stringify(resolve("../hooks/dist/index.js"))};
      const workflow = defineWorkflow({
        id: "catalog", version: "1", nodes: { answer: { run: () => {
          const context = useRuntimeContext();
          if (context.actor !== "reader") throw new Error("Actor was not bound");
          return { ui: { message: "Catalog ready" } };
        } } }, edges: [["__start__", "answer"], ["answer", "__end__"]],
      });
      const agent = createAgent({ frameworkAdapter: createInMemoryFrameworkAdapter(), defaultWorkflowId: "catalog", workflows: [workflow] });
      export const evals = createEvals({
        agent, suites: [{ id: "native", cases: [{ id: "context", steps: [{ message: "Show catalog", expect: { type: "answer" } }] }] }],
        execute: ({ run }) => run({ context: { actor: "reader" } }),
      });
    `,
    );
    const { stdout } = await execute(
      process.execPath,
      [
        "--import",
        "tsx",
        entry,
        "evals",
        "run",
        "--entry",
        "evals.ts",
        "--json",
      ],
      {
        cwd: directory,
        env: { ...process.env, NO_COLOR: "1" },
        timeout: 20_000,
      },
    );
    const result = JSON.parse(stdout);
    expect(result.status).toBe("passed");
    expect(result.runs[0].cases[0].steps[0].observation.text).toBe(
      "Catalog ready",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 25_000);
