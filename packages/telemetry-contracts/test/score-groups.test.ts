import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_FIELD,
  ASSESSMENT_SCORE_GROUP,
  type ScoreField,
  ScoreGroupDefinitionSchema,
  ScoreGroupResultSchema,
  scoreGroupOutputSchema,
} from "../src/score-groups";

const common = {
  label: "Metric",
  description: "Use the recorded evidence.",
  allowNotApplicable: true,
  allowInsufficientEvidence: true,
};
const fields: ScoreField[] = [
  ASSESSMENT_FIELD,
  {
    ...common,
    id: "relevance",
    type: "number",
    preset: "score",
    min: 0,
    max: 1,
    integer: false,
    direction: "higher",
  },
  {
    ...common,
    id: "helpfulness",
    type: "number",
    preset: "rating",
    min: 1,
    max: 5,
    integer: true,
    direction: "higher",
  },
  { ...common, id: "grounded", type: "boolean" },
  {
    ...common,
    id: "intent",
    type: "category",
    multiple: false,
    options: [
      { id: "support", label: "Support", description: "Help requests" },
      { id: "sales", label: "Sales", description: "Buying" },
    ],
  },
  {
    ...common,
    id: "issues",
    type: "category",
    multiple: true,
    options: [
      { id: "wrong_location", label: "Wrong location", description: "" },
      { id: "unsupported_claim", label: "Unsupported claim", description: "" },
    ],
  },
];
const group = { name: "Quality", description: "", fields };
const result = (value: unknown) => ({
  status: "scored",
  value,
  reason: "Supported by the recording.",
  evidence: [],
});
const values = () => ({
  assessment: result("The answer meets the request."),
  relevance: result(0.8),
  helpfulness: result(4),
  grounded: result(true),
  intent: result("support"),
  issues: result(["wrong_location", "unsupported_claim"]),
});

describe("score-group output contracts", () => {
  it("always provides a text-only Assessment default with no hidden pass/fail", () => {
    const schema = scoreGroupOutputSchema(ASSESSMENT_SCORE_GROUP.definition);
    expect(
      schema.parse({
        assessment: result("The response explains the captured result."),
      }),
    ).toEqual({
      assessment: result("The response explains the captured result."),
    });
    expect(
      schema.safeParse({ assessment: result(""), passed: true }).success,
    ).toBe(false);
  });
  it("accepts typed values across numeric presets, booleans and category modes", () => {
    expect(scoreGroupOutputSchema(group).parse(values())).toEqual(values());
  });
  it.each([
    ["relevance", 1.01],
    ["relevance", -0.1],
    ["helpfulness", 3.5],
    ["grounded", "true"],
    ["intent", "other"],
    ["issues", ["wrong_location", "wrong_location"]],
    ["assessment", ""],
  ])("rejects an invalid %s value atomically", (key, value) => {
    expect(
      scoreGroupOutputSchema(group).safeParse({
        ...values(),
        [key as string]: result(value),
      }).success,
    ).toBe(false);
  });
  it("distinguishes missing evidence and not applicable from zero and false", () => {
    const schema = scoreGroupOutputSchema(group);
    expect(
      schema.safeParse({
        ...values(),
        relevance: { ...result(null), status: "insufficient_evidence" },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        ...values(),
        grounded: { ...result(null), status: "not_applicable" },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...values(), relevance: result(null) }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...values(),
        relevance: { ...result(0), status: "insufficient_evidence" },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...values(),
        assessment: { ...result(null), status: "not_applicable" },
      }).success,
    ).toBe(false);
  });
  it("requires the complete declared output and rejects unexpected fields", () => {
    expect(
      scoreGroupOutputSchema(group).safeParse({
        ...values(),
        issues: result([]),
      }).success,
    ).toBe(true);
    const { grounded: _, ...partial } = values();
    expect(scoreGroupOutputSchema(group).safeParse(partial).success).toBe(
      false,
    );
    expect(
      scoreGroupOutputSchema(group).safeParse({
        ...values(),
        confidence: result(0.9),
      }).success,
    ).toBe(false);
  });
  it("validates persisted and transported results against their exact group snapshot", () => {
    const snapshot = { ...ASSESSMENT_SCORE_GROUP, definition: group };
    expect(
      ScoreGroupResultSchema.safeParse({ group: snapshot, fields: values() })
        .success,
    ).toBe(true);
    expect(
      ScoreGroupResultSchema.safeParse({
        group: snapshot,
        fields: { ...values(), relevance: result(9) },
      }).success,
    ).toBe(false);
  });
  it("rejects invalid definitions and requires Assessment", () => {
    expect(
      ScoreGroupDefinitionSchema.safeParse({
        ...group,
        fields: fields.slice(1),
      }).success,
    ).toBe(false);
    expect(
      ScoreGroupDefinitionSchema.safeParse({
        ...group,
        fields: [ASSESSMENT_FIELD, fields[1], fields[1]],
      }).success,
    ).toBe(false);
    expect(
      ScoreGroupDefinitionSchema.safeParse({
        ...group,
        fields: [ASSESSMENT_FIELD, { ...fields[1], min: 0, max: 100 }],
      }).success,
    ).toBe(false);
  });
});
