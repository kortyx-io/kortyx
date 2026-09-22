import { describe, expect, it } from "vitest";
import { toJSONSchema } from "zod";
import { isJevModelId, jevOutputSchema } from "../src/jev";

describe("jevOutputSchema", () => {
  it("validates the simplified Jev output and carries the native questions", () => {
    const questions = {
      queue: {
        type: "choice" as const,
        instructions: "Choose a queue",
        criteria: { billing: "Billing", technical: "Technical" },
      },
      urgency: {
        type: "score" as const,
        instructions: "Score urgency",
        criteria: ["Low", "Medium", "High"],
      },
      needsHuman: {
        type: "noul" as const,
        instructions: "Needs a human?",
      },
    };
    const schema = jevOutputSchema(questions);

    expect(
      schema.safeParse({
        queue: "billing",
        urgency: 1.5,
        needsHuman: 0.8,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        queue: "unknown",
        urgency: 4,
        needsHuman: true,
      }).success,
    ).toBe(false);
    expect(toJSONSchema(schema)).toMatchObject({
      "x-kortyx-openrouter-system-one": { questions },
    });
    expect(schema["~kortyx"]).toEqual({ nativeOutput: true });
  });

  it("recognizes OpenRouter Jev model ids", () => {
    expect(isJevModelId("typesafe/jev-1.13")).toBe(true);
    expect(isJevModelId("~typesafe/jev-latest")).toBe(true);
    expect(isJevModelId("jev-latest")).toBe(true);
    expect(isJevModelId("anthropic/claude-sonnet-4.6")).toBe(false);
  });

  it("rejects score scales outside Jev's supported bounds", () => {
    expect(() =>
      jevOutputSchema({
        invalid: {
          type: "score",
          instructions: "Score it",
          criteria: ["Only one level"],
        },
      }),
    ).toThrow("between 2 and 10 criteria");
  });
});
