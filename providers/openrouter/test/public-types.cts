import { createOpenRouter, jevOutputSchema } from "@kortyx/openrouter";

const provider = createOpenRouter({ apiKey: "type-check-only" });
provider("anthropic/claude-sonnet-4.6");
provider("typesafe/jev-1.13");

const schema = jevOutputSchema({
  queue: {
    type: "choice",
    instructions: "Choose",
    criteria: { one: "First", two: "Second" },
  },
  score: {
    type: "score",
    instructions: "Score",
    criteria: ["Low", "High"],
  },
  likely: {
    type: "noul",
    instructions: "Likely?",
  },
});

const parsed = schema.safeParse({ queue: "one", score: 0.5, likely: 0.8 });
if (parsed.success) {
  const queue: "one" | "two" = parsed.data.queue;
  const score: number = parsed.data.score;
  const likely: number = parsed.data.likely;
  void [queue, score, likely];
}
