import type { StreamChunk } from "@kortyx/stream/browser";
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
      } as unknown as StreamChunk,
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

  it("falls back to multi-choice when kind is missing and multiple is true", () => {
    const piece = toHumanInputPiece({
      chunk: {
        type: "interrupt",
        requestId: "request-1",
        resumeToken: "resume-1",
        input: {
          multiple: true,
          options: [{ id: "a", label: "Option A" }],
        },
      } as unknown as StreamChunk,
      createId: () => "piece-x",
    });

    expect(piece.kind).toBe("multi-choice");
    expect(piece.multiple).toBe(true);
  });

  it("filters options missing id or label, includes descriptions when present", () => {
    const piece = toHumanInputPiece({
      chunk: {
        type: "interrupt",
        requestId: "request-3",
        resumeToken: "resume-3",
        input: {
          kind: "choice",
          options: [
            { id: "a", label: "Option A", description: "first" },
            { id: "", label: "no-id" },
            { id: "c", label: "" },
            { id: "d", label: "Option D" },
          ],
        },
      } as unknown as StreamChunk,
      createId: () => "piece-3",
    });

    expect(piece.options).toEqual([
      { id: "a", label: "Option A", description: "first" },
      { id: "d", label: "Option D" },
    ]);
  });

  it("defaults missing resumeToken, requestId, and options to safe values", () => {
    const piece = toHumanInputPiece({
      chunk: {
        type: "interrupt",
      } as unknown as StreamChunk,
      createId: () => "piece-default",
    });

    expect(piece).toEqual({
      id: "piece-default",
      type: "interrupt",
      resumeToken: "",
      requestId: "",
      kind: "choice",
      question: "Please choose",
      multiple: false,
      options: [],
    });
  });

  it("omits a non-string question on text interrupts", () => {
    const piece = toHumanInputPiece({
      chunk: {
        type: "interrupt",
        requestId: "request-no-q",
        resumeToken: "resume-no-q",
        input: {
          kind: "text",
        },
      } as unknown as StreamChunk,
      createId: () => "piece-no-q",
    });

    expect(piece.kind).toBe("text");
    expect("question" in piece).toBe(false);
  });

  it("uses an explicit question on choice interrupts", () => {
    const piece = toHumanInputPiece({
      chunk: {
        type: "interrupt",
        requestId: "request-q",
        resumeToken: "resume-q",
        input: {
          kind: "choice",
          question: "Choose carefully",
          options: [{ id: "a", label: "Option A" }],
        },
      } as unknown as StreamChunk,
      createId: () => "piece-q",
    });

    expect(piece.question).toBe("Choose carefully");
  });

  it("coerces missing option id and label fields via nullish defaults", () => {
    const piece = toHumanInputPiece({
      chunk: {
        type: "interrupt",
        requestId: "request-z",
        resumeToken: "resume-z",
        input: {
          kind: "choice",
          options: [
            { id: undefined, label: "no-id-label" },
            { id: "real", label: undefined },
            { id: "good", label: "Good" },
          ],
        },
      } as unknown as StreamChunk,
      createId: () => "piece-z",
    });

    expect(piece.options).toEqual([{ id: "good", label: "Good" }]);
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
