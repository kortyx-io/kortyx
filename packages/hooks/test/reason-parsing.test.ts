import type { InterruptInput } from "@kortyx/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseInterruptFirstPassResult,
  parseReasonOutputWithSchema,
  resolveOutputCandidate,
} from "../src/reason/parsing";
import {
  defaultContinuationInput,
  defaultInterruptFirstPassInput,
  withOutputGuardrails,
  withStructuredStreamHints,
} from "../src/reason/prompting";

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

  it("reports truncated structured output as a length failure, not a schema mismatch", () => {
    expect(() =>
      parseReasonOutputWithSchema({
        text: '{"summary":"unfinished"',
        schema: OutputSchema,
        finishReason: { unified: "length", raw: "length" },
        label: "useReason output",
      }),
    ).toThrow(
      "useReason output was truncated before producing valid structured output.",
    );

    expect(() =>
      parseReasonOutputWithSchema({
        text: '{"summary":"unfinished"',
        schema: OutputSchema,
        label: "useReason output",
      }),
    ).toThrow(
      "useReason output was truncated before producing valid structured output.",
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

  it("preserves schema validation failures for malformed structured output payloads", () => {
    expect(() =>
      parseInterruptFirstPassResult({
        text: JSON.stringify({
          output: {
            details: "not the declared shape",
          },
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
    ).toThrow("useReason output validation failed");
  });

  it("reports truncated interrupt first-pass output schema failures distinctly", () => {
    expect(() =>
      parseInterruptFirstPassResult({
        text: JSON.stringify({
          output: {
            details: "not the declared shape",
          },
          interruptRequest: {
            kind: "choice",
            question: "Pick one",
            options: [{ id: "one", label: "One" }],
          },
          draftText: "Draft",
        }),
        requestSchema: ChoiceRequestSchema,
        outputSchema: OutputSchema,
        finishReason: {
          unified: "length",
          raw: "MAX_TOKENS",
        },
      }),
    ).toThrow(
      "useReason output was truncated before producing valid structured output.",
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

  it("accepts required interrupt request aliases used by provider adapters", () => {
    const requestAlias = parseInterruptFirstPassResult({
      text: JSON.stringify({
        request: {
          kind: "choice",
          question: "Pick one",
          options: [{ id: "request", label: "Request alias" }],
        },
        draftText: "Draft from request alias",
      }),
      requestSchema: ChoiceRequestSchema,
    });

    const interruptAlias = parseInterruptFirstPassResult({
      text: JSON.stringify({
        interrupt: {
          kind: "choice",
          question: "Pick one",
          options: [{ id: "interrupt", label: "Interrupt alias" }],
        },
        draftText: "Draft from interrupt alias",
      }),
      requestSchema: ChoiceRequestSchema,
    });

    expect(requestAlias.interruptRequired).toBe(true);
    expect(interruptAlias.interruptRequired).toBe(true);
    if (!requestAlias.request || !interruptAlias.request) {
      throw new Error(
        "Expected required interrupt parsing to return requests.",
      );
    }
    expect(requestAlias.request.options[0]?.id).toBe("request");
    expect(interruptAlias.request.options[0]?.id).toBe("interrupt");
  });

  it("derives draft text from validated output when the first pass omits draftText", () => {
    const result = parseInterruptFirstPassResult({
      text: JSON.stringify({
        output: {
          summary: "Draft summary",
        },
        interruptRequest: {
          kind: "choice",
          question: "Pick one",
          options: [{ id: "one", label: "One" }],
        },
      }),
      requestSchema: ChoiceRequestSchema,
      outputSchema: OutputSchema,
    });

    expect(result.draftText).toBe(
      JSON.stringify(
        {
          summary: "Draft summary",
        },
        null,
        2,
      ),
    );
    expect(result.output).toEqual({
      summary: "Draft summary",
    });
  });

  it("rejects optional continue responses that smuggle an interrupt request alias", () => {
    expect(() =>
      parseInterruptFirstPassResult({
        text: JSON.stringify({
          decision: "continue",
          request: {
            kind: "choice",
            question: "Pick one",
            options: [{ id: "one", label: "One" }],
          },
          draftText: "Final answer",
        }),
        requestSchema: ChoiceRequestSchema,
        mode: "optional",
      }),
    ).toThrow(
      'useReason optional interrupt first pass with decision "continue" must not include an interrupt request.',
    );
  });
});

describe("reason prompting", () => {
  it("renders first-pass interrupt prompts for required and optional modes", () => {
    const requiredPlain = defaultInterruptFirstPassInput({
      input: "Create a launch plan",
      requestSchema: ChoiceRequestSchema,
    });
    const requiredStructured = defaultInterruptFirstPassInput({
      input: "Create a launch plan",
      requestSchema: ChoiceRequestSchema,
      outputSchema: OutputSchema,
    });
    const optionalPlain = defaultInterruptFirstPassInput({
      input: "Create a launch plan",
      requestSchema: ChoiceRequestSchema,
      mode: "optional",
    });
    const optionalStructured = defaultInterruptFirstPassInput({
      input: "Create a launch plan",
      requestSchema: ChoiceRequestSchema,
      outputSchema: OutputSchema,
      mode: "optional",
    });

    expect(requiredPlain).toContain(
      "Return an object with keys: draftText, interruptRequest.",
    );
    expect(requiredStructured).toContain(
      "Return an object with keys: output, interruptRequest, draftText.",
    );
    expect(requiredStructured).toContain("JSON template:");
    expect(optionalPlain).toContain(
      "Return an object with keys: decision, draftText, interruptRequest.",
    );
    expect(optionalStructured).toContain(
      "Return an object with keys: decision, output, interruptRequest, draftText.",
    );
    expect(optionalStructured).toContain(
      '"decision": "continue", "output": { ... }',
    );
  });

  it("renders continuation prompts without crashing on circular draft objects", () => {
    const circular: Record<string, unknown> = {
      summary: "Draft",
    };
    circular.self = circular;

    const input = defaultContinuationInput({
      input: "Create a launch plan",
      draftText: "Draft text",
      draftOutput: circular,
      request: {
        kind: "choice",
        question: "Pick one",
        options: [{ id: "one", label: "One" }],
      } as unknown as InterruptInput,
      response: {
        selected: "one",
      },
    });

    expect(input).toContain("Original request:\nCreate a launch plan");
    expect(input).toContain("Draft output object:\n[object Object]");
    expect(input).toContain('"selected": "one"');
  });

  it("adds output guardrails even when no JSON schema hint can be generated", () => {
    const input = withOutputGuardrails("Return a plan");

    expect(input).toContain("Return a plan");
    expect(input).toContain("- Return only JSON, no markdown fences.");
    expect(input).not.toContain("Expected output JSON schema");
  });

  it("adds structured stream hints only when a stream mode is configured", () => {
    expect(withStructuredStreamHints("Return a plan", {})).toBe(
      "Return a plan",
    );

    const input = withStructuredStreamHints("Return a plan", {
      setFieldPaths: ["title"],
      appendFieldPaths: ["jobs"],
      textDeltaFieldPaths: ["body"],
    });

    expect(input).toContain("Streaming rules:");
    expect(input).toContain("field path pattern `title`");
    expect(input).toContain("array field path pattern `jobs`");
    expect(input).toContain("string field path pattern `body`");
    expect(input).toContain("- Keep the overall response as valid JSON.");
  });
});
