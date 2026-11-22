import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSESSMENT_GROUP,
  ScoreGroupSchema,
  validateScoreGroupResult,
} from "../src/evaluators";

describe("Versioned score-group results", () => {
  it("accepts text-only assessment and rejects implicit or missing judgments", () => {
    expect(
      validateScoreGroupResult(DEFAULT_ASSESSMENT_GROUP, [
        {
          fieldId: "assessment",
          status: "scored",
          value: "The answer is supported by the recorded result.",
          evidence: [],
        },
      ]),
    ).toHaveLength(1);
    expect(() =>
      validateScoreGroupResult(DEFAULT_ASSESSMENT_GROUP, []),
    ).toThrow();
    expect(() =>
      validateScoreGroupResult(DEFAULT_ASSESSMENT_GROUP, [
        {
          fieldId: "assessment",
          status: "insufficient_evidence",
          evidence: [],
        },
      ]),
    ).toThrow();
  });
  it("preserves false, zero and explicit abstention while enforcing field constraints", () => {
    const group = ScoreGroupSchema.parse({
      ...DEFAULT_ASSESSMENT_GROUP,
      fields: [
        ...DEFAULT_ASSESSMENT_GROUP.fields,
        {
          id: "correct",
          label: "Correct",
          type: "boolean",
          description: "Whether the result is correct.",
          abstain: true,
        },
        {
          id: "quality",
          label: "Quality",
          type: "numeric",
          description: "Quality from zero to five.",
          min: 0,
          max: 5,
          direction: "higher",
          abstain: true,
        },
      ],
    });
    const scores = [
      {
        fieldId: "assessment",
        status: "scored",
        value: "The result failed the requirement.",
        evidence: [],
      },
      { fieldId: "correct", status: "scored", value: false, evidence: [] },
      { fieldId: "quality", status: "scored", value: 0, evidence: [] },
    ];
    expect(validateScoreGroupResult(group, scores)[1]?.value).toBe(false);
    expect(() =>
      validateScoreGroupResult(group, [
        ...scores.slice(0, 2),
        { ...scores[2], value: 6 },
      ]),
    ).toThrow();
    expect(
      validateScoreGroupResult(group, [
        ...scores.slice(0, 2),
        { fieldId: "quality", status: "insufficient_evidence", evidence: [] },
      ])[2]?.value,
    ).toBeUndefined();
    expect(() =>
      validateScoreGroupResult(group, [
        ...scores.slice(0, 2),
        {
          fieldId: "quality",
          status: "insufficient_evidence",
          value: 0,
          evidence: [],
        },
      ]),
    ).toThrow();
  });
});
