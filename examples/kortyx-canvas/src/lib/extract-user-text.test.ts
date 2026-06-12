import { describe, expect, it } from "vitest";
import { extractUserText } from "./extract-user-text";

describe("extractUserText", () => {
  it("returns empty string for nullish input", () => {
    expect(extractUserText(undefined)).toBe("");
    expect(extractUserText(null)).toBe("");
  });

  it("trims a raw string", () => {
    expect(extractUserText("  hello world  ")).toBe("hello world");
  });

  it("reads userText from a forwarded state object", () => {
    expect(extractUserText({ userText: "  update intro " })).toBe(
      "update intro",
    );
  });

  it("ignores objects without userText", () => {
    expect(
      extractUserText({ acknowledgement: "got it" } as { userText?: string }),
    ).toBe("");
    expect(extractUserText({} as { userText?: string })).toBe("");
  });
});
