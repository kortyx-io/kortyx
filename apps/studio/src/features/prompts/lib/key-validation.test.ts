import { describe, expect, it } from "vitest";
import { promptKeyError } from "./key-validation";

describe("prompt key feedback", () => {
  it.each([
    "canvas/classify-intent",
    "Test_2.v1",
    "1",
    "a".repeat(200),
  ])("accepts %s", (key) => {
    expect(promptKeyError(key)).toBeNull();
  });
  it.each([
    "",
    " test",
    "test ",
    "classify intent",
    "a\tb",
    "a\nb",
    "/test",
    "-test",
    "é",
    "a?b",
    "a".repeat(201),
  ])("rejects invalid input immediately: %s", (key) => {
    expect(promptKeyError(key)).not.toBeNull();
  });
});
