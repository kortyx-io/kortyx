import { describe, expect, it } from "vitest";
import { matchesSearchText } from "./search-text";

describe("matchesSearchText", () => {
  it.each([
    "chat title",
    "chat-title",
    "chat_title",
    "chatTitle",
    "chat.title",
  ])("matches %s against a hyphenated node name", (query) => {
    expect(matchesSearchText(query, ["generate-chat-title"])).toBe(true);
  });

  it("still requires the complete phrase in order", () => {
    expect(matchesSearchText("title chat", ["generate-chat-title"])).toBe(
      false,
    );
  });
});
