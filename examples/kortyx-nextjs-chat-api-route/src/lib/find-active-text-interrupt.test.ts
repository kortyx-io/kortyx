import { describe, expect, it } from "vitest";
import type { ChatMsg, ContentPiece, HumanInputPiece } from "./chat-types";
import { findActiveTextInterrupt } from "./find-active-text-interrupt";

const textInterrupt: HumanInputPiece = {
  id: "interrupt-1",
  type: "interrupt",
  resumeToken: "token-1",
  requestId: "request-1",
  kind: "text",
  question: "Enter a label",
  multiple: false,
  options: [],
};

describe("findActiveTextInterrupt", () => {
  it("prefers a live streaming text interrupt", () => {
    const result = findActiveTextInterrupt({
      messages: [],
      streamContentPieces: [textInterrupt],
    });

    expect(result).toBe(textInterrupt);
  });

  it("falls back to the latest assistant message interrupt", () => {
    const messages: ChatMsg[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        contentPieces: [textInterrupt satisfies ContentPiece],
      },
    ];

    const result = findActiveTextInterrupt({
      messages,
      streamContentPieces: [],
    });

    expect(result).toEqual(textInterrupt);
  });

  it("returns the newest assistant text interrupt", () => {
    const olderInterrupt: HumanInputPiece = {
      ...textInterrupt,
      id: "interrupt-older",
      resumeToken: "token-older",
      requestId: "request-older",
    };
    const newerInterrupt: HumanInputPiece = {
      ...textInterrupt,
      id: "interrupt-newer",
      resumeToken: "token-newer",
      requestId: "request-newer",
    };

    const messages: ChatMsg[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
        contentPieces: [olderInterrupt satisfies ContentPiece],
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: "",
        contentPieces: [newerInterrupt satisfies ContentPiece],
      },
    ];

    const result = findActiveTextInterrupt({
      messages,
      streamContentPieces: [],
    });

    expect(result).toEqual(newerInterrupt);
  });
});
