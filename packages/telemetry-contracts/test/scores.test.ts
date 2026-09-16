import { describe, expect, it } from "vitest";
import {
  ClearUserFeedbackRequestSchema,
  StudioReviewRequestSchema,
  type StudioScore,
  summarizeUserFeedback,
  UserFeedbackRequestSchema,
} from "../src/scores";

describe("feedback contracts", () => {
  it("accepts bounded boolean ratings and optional detail", () => {
    expect(
      UserFeedbackRequestSchema.parse({
        runId: "run",
        actorId: "user",
        value: 0,
        reasons: ["incorrect"],
        comment: " Wrong account ",
      }),
    ).toEqual({
      runId: "run",
      actorId: "user",
      value: 0,
      reasons: ["incorrect"],
      comment: "Wrong account",
    });
    expect(
      UserFeedbackRequestSchema.parse({
        runId: "run",
        actorId: "user",
        value: 1,
      }),
    ).toEqual({ runId: "run", actorId: "user", value: 1 });
  });
  it.each([
    { value: -1 },
    { value: 2 },
    { value: true },
    { actorId: " " },
    { source: "human-review" },
    { projectId: "another-project" },
    { reasons: ["invented"] },
    { comment: "x".repeat(4001) },
  ])("rejects invalid or caller-controlled scope/source: %j", (changes) => {
    expect(
      UserFeedbackRequestSchema.safeParse({
        runId: "run",
        actorId: "user",
        value: 1,
        ...changes,
      }).success,
    ).toBe(false);
  });
  it("clears only a named actor's feedback and separates review verdicts", () => {
    expect(
      ClearUserFeedbackRequestSchema.safeParse({
        runId: "run",
        actorId: "user",
      }).success,
    ).toBe(true);
    expect(
      StudioReviewRequestSchema.safeParse({
        value: "incorrect",
        actorId: "someone",
      }).success,
    ).toBe(false);
    expect(
      StudioReviewRequestSchema.safeParse({
        value: "partially-correct",
        comment: null,
      }).success,
    ).toBe(true);
  });
  it("does not count reviews or evaluator scores as user satisfaction", () => {
    const score = {
      source: "end-user",
      name: "user-feedback",
      dataType: "BOOLEAN",
      value: 0,
    } as Extract<StudioScore, { dataType: "BOOLEAN" }>;
    expect(
      summarizeUserFeedback([
        score,
        { ...score, value: 1 },
        { ...score, source: "human-review" },
        { ...score, source: "evaluator" },
        { ...score, name: "correctness" },
        { ...score, dataType: "NUMERIC" } as StudioScore,
      ]),
    ).toEqual({ positive: 1, negative: 1 });
  });
});
