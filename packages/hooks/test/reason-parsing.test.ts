import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseInterruptFirstPassResult,
  parseReasonOutputWithSchema,
  resolveOutputCandidate,
} from "../src/reason/parsing";

const ChoiceRequestSchema = z.object({
  kind: z.literal("choice"),
  question: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
});

const OutputSchema = z.object({
  summary: z.string(),
});

describe("reason parsing", () => {
  it("resolves direct JSON, fenced JSON, empty text, and plain text candidates", () => {
    expect(resolveOutputCandidate('{"summary":"ok"}')).toEqual({
      summary: "ok",
    });
    expect(
      resolveOutputCandidate('```json\n{"summary":"from block"}\n```'),
    ).toEqual({
      summary: "from block",
    });
    expect(resolveOutputCandidate("```json\n\n```")).toBe("```json\n\n```");
    expect(resolveOutputCandidate("   ")).toBe("   ");
    expect(resolveOutputCandidate("not json")).toBe("not json");
  });

  it("reports invalid structured text separately from schema validation", () => {
    expect(() =>
      parseReasonOutputWithSchema({
        text: "not json",
        schema: OutputSchema,
        label: "useReason output",
      }),
    ).toThrow(
      "useReason output did not produce valid structured output. The model returned text instead of the expected JSON payload.",
    );
  });

  it("reports empty interrupt first-pass payloads as missing JSON objects", () => {
    expect(() =>
      parseInterruptFirstPassResult({
        text: "",
        requestSchema: ChoiceRequestSchema,
      }),
    ).toThrow("useReason first pass with interrupt must return a JSON object.");
  });

  it("reports plain interrupt first-pass text as invalid structured output", () => {
    expect(() =>
      parseInterruptFirstPassResult({
        text: "plain text",
        requestSchema: ChoiceRequestSchema,
      }),
    ).toThrow(
      "useReason output did not produce valid structured output. The model returned text instead of the expected JSON payload.",
    );
  });

  it("reports string output payloads as invalid structured output", () => {
    expect(() =>
      parseInterruptFirstPassResult({
        text: JSON.stringify({
          output: "plain output",
          interruptRequest: {
            kind: "choice",
            question: "Pick one",
            options: [{ id: "one", label: "One" }],
          },
          draftText: "Draft",
        }),
        requestSchema: ChoiceRequestSchema,
        outputSchema: OutputSchema,
      }),
    ).toThrow(
      "useReason output did not produce valid structured output. The model returned text instead of the expected JSON payload.",
    );
  });

  it("uses candidate text when required interrupt mode receives the request object directly", () => {
    const result = parseInterruptFirstPassResult({
      text: JSON.stringify({
        kind: "choice",
        question: "Pick one",
        options: [{ id: "one", label: "One" }],
        text: "Draft from text field",
      }),
      requestSchema: ChoiceRequestSchema,
    });

    expect(result).toEqual({
      draftText: "Draft from text field",
      interruptRequired: true,
      request: {
        kind: "choice",
        question: "Pick one",
        options: [{ id: "one", label: "One" }],
      },
    });
  });
});
