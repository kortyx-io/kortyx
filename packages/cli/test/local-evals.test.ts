import {
  createEvals,
  type EvalRunOptions,
  type EvalSuite,
} from "@kortyx/agent";
import { Command } from "commander";
import { afterEach, expect, it, vi } from "vitest";
import { createLocalEvalsCommand } from "../src/evals/command";
import { createEvalTerminalReporter } from "../src/evals/reporter";

const suite: EvalSuite = {
  id: "catalog",
  name: "Product catalog",
  cases: [
    {
      id: "products",
      name: "Show products",
      steps: [
        {
          message: "List products",
          expect: {
            type: "answer",
            outputs: [{ schemaId: "app.product-list" }],
          },
        },
      ],
    },
  ],
};
const instance = (present = true) =>
  createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    execute: () => ({
      observation: {
        type: "answer",
        text: "",
        structured: present
          ? [{ schemaId: "app.product-list", status: "done", data: [] }]
          : [],
      },
    }),
  });
function harness(value: unknown = instance(), color = false) {
  const write = vi.fn();
  const setExitCode = vi.fn();
  const remove = vi.fn();
  const release = vi.fn();
  let interrupt: () => void = () => {};
  const load = vi.fn(
    async (): Promise<Record<string, unknown>> => ({ evals: value }),
  );
  const program = new Command()
    .exitOverride()
    .configureOutput({ writeErr: () => {} })
    .addCommand(
      createLocalEvalsCommand({
        load,
        release,
        write,
        color,
        cwd: "/app",
        setExitCode,
        onInterrupt: (abort) => {
          interrupt = abort;
          return remove;
        },
      }),
    );
  return {
    program,
    write,
    setExitCode,
    load,
    remove,
    release,
    interrupt: () => interrupt(),
    output: () => write.mock.calls.map((call) => call[0]).join(""),
    run: (...args: string[]) =>
      program.parseAsync(["evals", "run", "--entry", "evals.ts", ...args], {
        from: "user",
      }),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = 0;
});

it("runs a real SDK instance locally, emits a readable report and needs no Studio or model for output checks", async () => {
  const h = harness();
  await h.run();
  expect(h.load).toHaveBeenCalledWith("/app/evals.ts");
  expect(h.output()).toContain("◆ Kortyx Evals · Product catalog");
  expect(h.output()).toContain("✓ Show products [products] #1");
  expect(h.output()).toContain("1 passed · 0 failed");
  expect(h.output()).not.toContain("\u001b");
  expect(h.setExitCode).toHaveBeenCalledWith(0);
  expect(h.remove).toHaveBeenCalledOnce();
  expect(h.release).toHaveBeenCalledOnce();
});
it("a missing contract fails with a useful reason and a failing exit code", async () => {
  const h = harness(instance(false), true);
  await h.run("--suite", "catalog");
  expect(h.output()).toContain("app.product-list (any version)");
  expect(h.output()).toContain("Expected answer · observed answer");
  expect(h.output()).toContain("RUN");
  expect(h.output()).toContain("\u001b[0J");
  expect(h.setExitCode).toHaveBeenCalledWith(1);
});
it("preserves SDK defaults unless overridden, filters cases, and emits pure JSON with full saved results", async () => {
  const evals = instance();
  const run = vi.spyOn(evals, "run");
  const h = harness(evals, true);
  await h.run(
    "--suite",
    "catalog",
    "--case",
    "products",
    "--repetitions",
    "2",
    "--concurrency",
    "2",
    "--json",
  );
  expect(run).toHaveBeenCalledWith(
    expect.objectContaining({
      suiteId: "catalog",
      caseIds: ["products"],
      repetitions: 2,
      concurrency: 2,
    }),
  );
  const parsed = JSON.parse(h.output());
  expect(parsed.schemaVersion).toBe(1);
  expect(parsed.counts.passed).toBe(2);
  expect(parsed.runs[0].cases[0].steps[0].expectation.outputs).toEqual(
    suite.cases[0]?.steps[0]?.expect.outputs,
  );
  expect(h.write).toHaveBeenCalledOnce();
  expect(h.setExitCode).toHaveBeenCalledWith(0);
});
it("runs all suites in definition order, continues after a failure and aggregates status", async () => {
  const evals = instance();
  const run = vi.fn(async (options: EvalRunOptions) => ({
    ...(await evals.run({ ...options, suiteId: "catalog" })),
    suiteId: options.suiteId,
    status:
      options.suiteId === "second" ? ("error" as const) : ("passed" as const),
    counts:
      options.suiteId === "second"
        ? { passed: 0, failed: 0, error: 1, cancelled: 0 }
        : { passed: 1, failed: 0, error: 0, cancelled: 0 },
  }));
  const h = harness({
    describe: () => ({ suites: [suite, { ...suite, id: "second" }] }),
    run,
  });
  await h.run();
  expect(run.mock.calls.map((call) => call[0].suiteId)).toEqual([
    "catalog",
    "second",
  ]);
  expect(h.output()).toContain(
    "Overall ERROR · 2/2 suites · 1 passed · 0 failed · 1 errors",
  );
  expect(h.setExitCode).toHaveBeenCalledWith(1);
});
it.each([
  null,
  {},
  { run: () => {} },
  { run: 2, describe: () => ({}) },
  { run: () => {}, describe: 2 },
])("rejects incorrect exports without executing any workflow: %j", async (value) => {
  await expect(harness(value).run()).rejects.toThrow("createEvals instance");
});
it("rejects empty manifests", async () => {
  await expect(
    harness({ run: vi.fn(), describe: () => ({ suites: [] }) }).run(),
  ).rejects.toThrow("No eval suites");
});
it.each([
  ["--suite", "missing"],
  ["--case", "products"],
  ["--suite", "catalog", "--case", "missing"],
  ["--suite", "catalog", "--case", "products", "products"],
  ["--repetitions", "0"],
  ["--concurrency", "NaN"],
  ["--concurrency", "-1"],
  ["--repetitions", "9007199254740992"],
])("rejects invalid selection or numeric options: %j", async (...args) => {
  const evals = instance();
  const run = vi.spyOn(evals, "run");
  await expect(harness(evals).run(...args)).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});
it("lists suites as text and JSON, accepts default and named exports", async () => {
  for (const [module, args] of [
    [{ default: instance() }, []],
    [{ custom: instance() }, ["--export", "custom", "--json"]],
  ] as const) {
    const h = harness();
    h.load.mockResolvedValue(module);
    await h.program.parseAsync(
      ["evals", "list", "--entry", "evals.ts", ...args],
      { from: "user" },
    );
    if (args.length) expect(JSON.parse(h.output())[0].id).toBe("catalog");
    else expect(h.output()).toContain("catalog\tProduct catalog\t1 cases");
  }
});
it("reports the missing named export", async () => {
  await expect(harness().run("--export", "absent")).rejects.toThrow(
    "Export absent",
  );
});
it("local semantic criteria require a code judge, not an implicit Studio connection", async () => {
  const evals = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [
      {
        id: "semantic",
        cases: [
          {
            id: "meaning",
            steps: [
              {
                message: "Explain",
                expect: { type: "answer", criteria: ["Correct meaning"] },
              },
            ],
          },
        ],
      },
    ],
  });
  const h = harness(evals);
  await expect(h.run()).rejects.toThrow(
    "Local runs with criteria require a judge",
  );
  expect(h.remove).toHaveBeenCalledOnce();
  expect(h.release).toHaveBeenCalledOnce();
});
it("SIGINT forwards cancellation, skips remaining suites, returns 130 and removes the handler", async () => {
  const evals = instance();
  let h: ReturnType<typeof harness>;
  const run = vi.fn(async (options: EvalRunOptions) => {
    h.interrupt();
    expect(options.signal?.aborted).toBe(true);
    return {
      ...(await evals.run({ suiteId: "catalog" })),
      status: "cancelled" as const,
      counts: { passed: 0, failed: 0, error: 0, cancelled: 1 },
    };
  });
  h = harness({
    describe: () => ({ suites: [suite, { ...suite, id: "second" }] }),
    run,
  });
  await h.run("--json");
  expect(run).toHaveBeenCalledOnce();
  expect(JSON.parse(h.output()).status).toBe("cancelled");
  expect(h.setExitCode).toHaveBeenCalledWith(130);
  expect(h.remove).toHaveBeenCalledOnce();
  expect(h.release).toHaveBeenCalledOnce();
});
it("renders criterion evidence, public phase errors, cancelled attempts and stripped terminal controls", async () => {
  const result = await instance().run({ suiteId: "catalog" });
  const item = result.cases[0];
  const step = item?.steps[0];
  if (!item || !step) throw new Error("Fixture required");
  step.status = "failed";
  step.criteria = [
    {
      id: "price",
      text: "Correct price",
      passed: false,
      reason: "Mismatch\n\u001b",
      evidence: ["80 versus 90"],
    },
    { id: "shape", text: "Complete", passed: true, reason: "OK", evidence: [] },
  ];
  item.errors = [
    {
      phase: "execute",
      code: "EVAL_EXECUTION_FAILED",
      message: "Safe failure",
    },
  ];
  result.errors = [
    { phase: "setup", code: "EVAL_SETUP_FAILED", message: "Unavailable" },
  ];
  item.durationMs = 1100;
  const write = vi.fn();
  const reporter = createEvalTerminalReporter(write, false);
  reporter.start({ ...suite, name: "Catalog\n\u001b" });
  reporter.progress({
    type: "case-started",
    caseId: "products",
    repetition: 1,
    sessionId: "fixture",
  });
  reporter.progress({
    type: "step-completed",
    caseId: "products",
    repetition: 1,
    step,
  });
  reporter.progress({
    type: "case-completed",
    result: { ...item, caseId: "other", status: "cancelled" },
  });
  reporter.finish(result);
  const output = write.mock.calls.map((call) => call[0]).join("");
  expect(output).toContain("− other [other] #1 · 1.10 s");
  expect(output).toContain("Evidence: 80 versus 90");
  expect(output).toContain("Safe failure");
  expect(output).toContain("Unavailable");
  expect(output).not.toContain("\u001b");
});
it("uses SDK suite IDs when names are absent and supports --no-color", async () => {
  const h = harness(
    {
      describe: () => ({
        suites: [
          {
            ...suite,
            name: undefined,
            cases: suite.cases.map(({ name: _name, ...item }) => item),
          },
        ],
      }),
      run: instance().run,
    },
    true,
  );
  await h.run("--no-color");
  expect(h.output()).toContain("◆ Kortyx Evals · catalog");
  expect(h.output()).toContain("✓ products [products]");
  expect(h.output()).not.toContain("\u001b");
});

it("uses the real process defaults, disables color through environment, and unregisters SIGINT on errors", async () => {
  vi.stubEnv("NO_COLOR", "1");
  const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const load = vi.fn(async () => ({ evals: instance() }));
  const baseline = process.listenerCount("SIGINT");
  const command = createLocalEvalsCommand({ load });
  await command.parseAsync(["run", "--entry", "evals.ts"], { from: "user" });
  expect(load).toHaveBeenCalledWith(`${process.cwd()}/evals.ts`);
  expect(write.mock.calls.map((call) => call[0]).join("")).not.toContain(
    "\u001b",
  );
  expect(process.exitCode).toBe(0);
  expect(process.listenerCount("SIGINT")).toBe(baseline);
  const failing = createLocalEvalsCommand({
    load: async () => ({
      evals: {
        describe: () => ({ suites: [suite] }),
        run: async () => {
          throw new Error("Import-side failure");
        },
      },
    }),
  });
  await expect(
    failing.parseAsync(["run", "--entry", "evals.ts"], { from: "user" }),
  ).rejects.toThrow("Import-side failure");
  expect(process.listenerCount("SIGINT")).toBe(baseline);
});
it("reports failed results without errors and defaults numeric overrides to SDK configuration", async () => {
  const evals = instance(false);
  const run = vi.spyOn(evals, "run");
  const h = harness(evals);
  await h.run("--json");
  expect(JSON.parse(h.output()).status).toBe("failed");
  expect(run.mock.calls[0]?.[0]).not.toHaveProperty("repetitions");
  expect(run.mock.calls[0]?.[0]).not.toHaveProperty("concurrency");
});
it("renders an errored attempt, a failed step without a reason, and unknown cases", async () => {
  const result = await instance().run({ suiteId: "catalog" });
  const item = result.cases[0];
  const step = item?.steps[0];
  if (!item || !step) throw new Error("Fixture required");
  step.status = "failed";
  delete step.reason;
  item.caseId = "unknown";
  item.status = "error";
  const write = vi.fn();
  const reporter = createEvalTerminalReporter(write, true);
  reporter.start(suite);
  reporter.progress({
    type: "case-started",
    caseId: "unknown",
    repetition: 1,
    sessionId: "fixture",
  });
  reporter.progress({ type: "case-completed", result: item });
  reporter.finish(result);
  reporter.close();
  expect(write.mock.calls.map((call) => call[0]).join("")).toContain(
    "unknown › attempt 1 › step 1",
  );
});

it("reuses actor setup, scripted human input and the code judge, and cleans up after a semantic failure", async () => {
  const commands: string[] = [];
  const teardown = vi.fn();
  const grade = vi.fn(() => ({
    passed: false,
    reason: "The selected product's price was changed in the answer.",
    evidence: ["Tool returned 80; answer claimed 90."],
  }));
  const evals = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [
      {
        id: "choice",
        cases: [
          {
            id: "blue-product",
            name: "Choose the blue product",
            steps: [
              {
                message: "Show the product",
                expect: { type: "interrupt", schemaId: "app.product-picker" },
              },
              {
                resume: { using: "chooseBlue" },
                expect: {
                  type: "answer",
                  criteria: ["Preserve the selected product's price"],
                },
              },
            ],
          },
        ],
      },
    ],
    setup: () => ({ actor: "test-reader" }),
    responders: {
      chooseBlue: ({ interrupt, prepared }) => {
        expect(prepared.actor).toBe("test-reader");
        expect(interrupt.options[0]?.id).toBe("blue");
        return { type: "select", ids: ["blue"] };
      },
    },
    execute: ({ command, prepared, history }) => {
      expect(prepared.actor).toBe("test-reader");
      commands.push(command.type);
      if (command.type === "message")
        return {
          continuation: "fixture-continuation",
          observation: {
            type: "interrupt",
            text: "Choose a product",
            structured: [],
            interrupt: {
              requestId: "fixture-picker",
              schemaId: "app.product-picker",
              kind: "choice",
              options: [{ id: "blue", label: "Blue" }],
            },
          },
        };
      expect(command).toEqual({
        type: "resume",
        response: { type: "select", ids: ["blue"] },
      });
      expect(history.length).toBeGreaterThan(0);
      return {
        observation: {
          type: "answer",
          text: "The blue product costs 90",
          structured: [],
          events: [{ type: "tool-result", output: { price: 80 } }],
        },
      };
    },
    judge: { id: "catalog-judge", version: "1", grade },
    teardown,
  });
  const h = harness(evals);
  await h.run();
  expect(commands).toEqual(["message", "resume"]);
  expect(grade).toHaveBeenCalledOnce();
  expect(h.output()).toContain("Choose the blue product › attempt 1 › step 2");
  expect(h.output()).toContain("Preserve the selected product's price");
  expect(h.output()).toContain(
    "Evidence: Tool returned 80; answer claimed 90.",
  );
  expect(teardown).toHaveBeenCalledOnce();
  expect(h.setExitCode).toHaveBeenCalledWith(1);
});

it("detects interactive color preferences without leaking terminal control sequences to disabled output", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  try {
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    for (const [noColor, forceColor, colored] of [
      [undefined, undefined, true],
      ["1", undefined, false],
      [undefined, "0", false],
    ] as const) {
      vi.stubEnv("NO_COLOR", noColor);
      vi.stubEnv("FORCE_COLOR", forceColor);
      write.mockClear();
      await createLocalEvalsCommand({
        load: async () => ({ evals: instance() }),
      }).parseAsync(["run", "--entry", "evals.ts"], { from: "user" });
      const output = write.mock.calls.map((call) => call[0]).join("");
      expect(output.includes("\u001b")).toBe(colored);
    }
  } finally {
    if (descriptor) Object.defineProperty(process.stdout, "isTTY", descriptor);
    else Reflect.deleteProperty(process.stdout, "isTTY");
  }
});
it("lists nameless suites by ID", async () => {
  const h = harness({
    describe: () => ({ suites: [{ id: suite.id, cases: suite.cases }] }),
    run: instance().run,
  });
  await h.program.parseAsync(["evals", "list", "--entry", "evals.ts"], {
    from: "user",
  });
  expect(h.output()).toContain("catalog\tcatalog\t1 cases");
});

it("releases the imported entry when discovery or selection fails", async () => {
  const h = harness(null);
  await expect(h.run()).rejects.toThrow("createEvals instance");
  expect(h.release).toHaveBeenCalledOnce();
  const selection = harness();
  await expect(selection.run("--suite", "unknown")).rejects.toThrow(
    "Unknown eval suite",
  );
  expect(selection.release).toHaveBeenCalledOnce();
});

it("explicit --color enables the live reporter, --no-color wins, and JSON stays clean", async () => {
  vi.stubEnv("NO_COLOR", "1");
  const colored = harness(instance(), false);
  await colored.run("--color");
  expect(colored.output()).toContain("SUITE PASSED");
  expect(colored.output()).toContain("\u001b");
  const plain = harness(instance(), false);
  await plain.run("--color", "--no-color");
  expect(plain.output()).not.toContain("\u001b");
  const json = harness(instance(), false);
  await json.run("--color", "--json");
  expect(JSON.parse(json.output()).status).toBe("passed");
  expect(json.output()).not.toContain("\u001b");
});

it("preserves application stdout/stderr during live rendering and restores both write methods", async () => {
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const errors = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const originalOutput = process.stdout.write;
  const originalErrors = process.stderr.write;
  const evals = createEvals({
    agent: { streamChat: vi.fn() },
    suites: [suite],
    execute: () => {
      process.stdout.write("App partial ");
      process.stdout.write(Buffer.from("continued\n"));
      process.stderr.write("App warning\n");
      return {
        observation: {
          type: "answer",
          text: "",
          structured: [
            { schemaId: "app.product-list", status: "done", data: [] },
          ],
        },
      };
    },
  });
  await createLocalEvalsCommand({ load: async () => ({ evals }) }).parseAsync(
    ["run", "--entry", "evals.ts", "--color"],
    { from: "user" },
  );
  const text = output.mock.calls.map((call) => String(call[0])).join("");
  expect(text).toContain("App partial continued\n");
  expect(errors.mock.calls.map((call) => String(call[0])).join("")).toContain(
    "App warning",
  );
  expect(process.stdout.write).toBe(originalOutput);
  expect(process.stderr.write).toBe(originalErrors);
});

it("restores live output hooks and timers when an application runner throws", async () => {
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const errors = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const originalOutput = process.stdout.write;
  const originalErrors = process.stderr.write;
  const command = createLocalEvalsCommand({
    load: async () => ({
      evals: {
        describe: () => ({ suites: [suite] }),
        run: async () => {
          throw new Error("Application failure");
        },
      },
    }),
  });
  await expect(
    command.parseAsync(["run", "--entry", "evals.ts", "--color"], {
      from: "user",
    }),
  ).rejects.toThrow("Application failure");
  expect(process.stdout.write).toBe(originalOutput);
  expect(process.stderr.write).toBe(originalErrors);
  expect(output).toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
});

it("does not overwrite an application's deliberate stderr replacement when restoring terminal output", async () => {
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const original = process.stderr.write;
  const replacement = vi.fn(() => true);
  try {
    const evals = createEvals({
      agent: { streamChat: vi.fn() },
      suites: [suite],
      execute: () => {
        process.stderr.write = replacement;
        process.stderr.write("Application redirected its logger\n");
        return {
          observation: {
            type: "answer",
            text: "",
            structured: [
              { schemaId: "app.product-list", status: "done", data: [] },
            ],
          },
        };
      },
    });
    await createLocalEvalsCommand({ load: async () => ({ evals }) }).parseAsync(
      ["run", "--entry", "evals.ts", "--color"],
      { from: "user" },
    );
    expect(process.stderr.write).toBe(replacement);
    expect(replacement).toHaveBeenCalledWith(
      "Application redirected its logger\n",
    );
  } finally {
    process.stderr.write = original;
  }
});
