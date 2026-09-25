import { describe, expect, it } from "vitest";
import { parseJsonDocument } from "./payload-presentation";

describe("parseJsonDocument", () => {
  it("renders complete JSON output as structured data", () => {
    expect(parseJsonDocument('{"sentences":["First","Second"]}')).toEqual({
      sentences: ["First", "Second"],
    });
    expect(parseJsonDocument(' [1, {"answer": true}] ')).toEqual([
      1,
      { answer: true },
    ]);
  });

  it("keeps prose, malformed JSON, and partial streams verbatim", () => {
    for (const raw of ["Hello", '{"answer":', '{"answer":1}\ntrailing']) {
      expect(parseJsonDocument(raw)).toBe(raw);
    }
  });
});
