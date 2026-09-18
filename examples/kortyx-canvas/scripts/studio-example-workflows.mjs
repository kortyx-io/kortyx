import { defineWorkflow } from "kortyx";
import { z } from "zod";

const step = (key) => ({ run: () => ({ data: { [key]: true } }) });
const workflow = (name, description, nodes, edges) =>
  defineWorkflow({
    id: `studio-example-${name}`,
    version: "1.0.0",
    description,
    inputSchema: z.object({
      route: z.string().optional(),
      attempts: z.number().optional(),
    }),
    outputSchema: z.record(z.string(), z.unknown()),
    nodes,
    edges,
  });

export const workflows = [
  workflow(
    "linear",
    "One entry and one exit.",
    {
      receive: step("received"),
      process: step("processed"),
      save: step("saved"),
    },
    [
      ["__start__", "receive"],
      ["receive", "process"],
      ["process", "save"],
      ["save", "__end__"],
    ],
  ),
  workflow(
    "chat-fork",
    "Same topology as hiring-monster 1.2.0; deterministic local node implementations.",
    {
      "generate-chat-title": step("titleGenerated"),
      "classify-chat-request": step("classified"),
      "dispatch-chat-request": step("dispatched"),
    },
    [
      ["__start__", "generate-chat-title"],
      ["__start__", "classify-chat-request"],
      ["generate-chat-title", "__end__"],
      ["classify-chat-request", "dispatch-chat-request"],
      ["dispatch-chat-request", "__end__"],
    ],
  ),
  workflow(
    "multiple-exits",
    "Three alternative terminal branches share one End marker.",
    {
      classify: { run: ({ input }) => ({ condition: input.route }) },
      approve: step("approved"),
      reject: step("rejected"),
      review: step("reviewed"),
    },
    [
      ["__start__", "classify"],
      ["classify", "approve", { when: "approve" }],
      ["classify", "reject", { when: "reject" }],
      ["classify", "review", { when: "review" }],
      ["approve", "__end__"],
      ["reject", "__end__"],
      ["review", "__end__"],
    ],
  ),
  workflow(
    "parallel-join",
    "Three parallel branches join before a single final exit.",
    {
      research: step("research"),
      enrich: step("enrich"),
      score: step("score"),
      combine: step("combined"),
      publish: step("published"),
    },
    [
      ["__start__", "research"],
      ["__start__", "enrich"],
      ["__start__", "score"],
      ["research", "combine"],
      ["enrich", "combine"],
      ["score", "combine"],
      ["combine", "publish"],
      ["publish", "__end__"],
    ],
  ),
  workflow(
    "retry-loop",
    "A conditional retry loop with success and fallback exits.",
    {
      draft: {
        run: ({ input }) => ({ data: { attempts: (input.attempts ?? 0) + 1 } }),
      },
      validate: {
        run: ({ input }) => ({
          condition: input.attempts < 2 ? "retry" : input.route,
        }),
      },
      publish: step("published"),
      fallback: step("fallback"),
    },
    [
      ["__start__", "draft"],
      ["draft", "validate"],
      ["validate", "draft", { when: "retry" }],
      ["validate", "publish", { when: "valid" }],
      ["validate", "fallback", { when: "fallback" }],
      ["publish", "__end__"],
      ["fallback", "__end__"],
    ],
  ),
  workflow(
    "early-exit",
    "A conditional edge goes directly to End, or continues through work.",
    {
      gate: { run: ({ input }) => ({ condition: input.route }) },
      work: step("worked"),
    },
    [
      ["__start__", "gate"],
      ["gate", "__end__", { when: "skip" }],
      ["gate", "work", { when: "continue" }],
      ["work", "__end__"],
    ],
  ),
  workflow(
    "complex",
    "Parallel research and conditional approval join, then validation chooses revision, success, or fallback.",
    {
      intake: step("received"),
      research: step("researched"),
      draft: step("drafted"),
      policy: {
        run: ({ input }) => ({
          condition: input.route === "manual" ? "manual" : "auto",
        }),
      },
      review: step("reviewed"),
      "auto-approve": step("approved"),
      combine: step("combined"),
      validate: {
        run: ({ input }) => ({
          condition:
            input.route === "manual"
              ? "revise"
              : input.route === "fallback"
                ? "fallback"
                : "valid",
        }),
      },
      revise: step("revised"),
      publish: step("published"),
      fallback: step("fallback"),
    },
    [
      ["__start__", "intake"],
      ["intake", "research"],
      ["intake", "policy"],
      ["research", "draft"],
      ["policy", "review", { when: "manual" }],
      ["policy", "auto-approve", { when: "auto" }],
      ["review", "combine"],
      ["auto-approve", "combine"],
      ["draft", "combine"],
      ["combine", "validate"],
      ["validate", "revise", { when: "revise" }],
      ["revise", "publish"],
      ["validate", "publish", { when: "valid" }],
      ["validate", "fallback", { when: "fallback" }],
      ["publish", "__end__"],
      ["fallback", "__end__"],
    ],
  ),
];
