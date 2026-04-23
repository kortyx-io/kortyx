import { describe, expect, it } from "vitest";
import { toHumanInputPiece } from "../src/to-human-input-piece";

describe("toHumanInputPiece", () => {
  it("defaults non-text interrupts to a choice prompt", () => {
    const piece = toHumanInputPiece({
      chunk: {
        type: "interrupt",
        requestId: "request-1",
        resumeToken: "resume-1",
        input: {
          kind: "choice",
          multiple: false,
          options: [{ id: "a", label: "Option A" }],
        },
      },
      createId: () => "piece-1",
    });

    expect(piece).toEqual({
      id: "piece-1",
      type: "interrupt",
      resumeToken: "resume-1",
      requestId: "request-1",
      kind: "choice",
      question: "Please choose",
      multiple: false,
      options: [{ id: "a", label: "Option A" }],
    });
  });

  it("preserves text questions and returns an empty option list", () => {
    const piece = toHumanInputPiece({
      chunk: {
        type: "interrupt",
        requestId: "request-2",
        resumeToken: "resume-2",
        input: {
          kind: "text",
          multiple: false,
          question: "Name it",
        },
      },
      createId: () => "piece-2",
    });

    expect(piece).toEqual({
      id: "piece-2",
      type: "interrupt",
      resumeToken: "resume-2",
      requestId: "request-2",
      kind: "text",
      question: "Name it",
      multiple: false,
      options: [],
    });
  });
});
