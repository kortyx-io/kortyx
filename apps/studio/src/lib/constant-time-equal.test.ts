import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "./constant-time-equal";

describe("constantTimeEqual", () => {
  it("accepts identical credentials", () => {
    expect(constantTimeEqual("Basic abc", "Basic abc")).toBe(true);
  });

  it("rejects different credentials with equal or different lengths", () => {
    expect(constantTimeEqual("Basic abc", "Basic xyz")).toBe(false);
    expect(constantTimeEqual("Basic abc", "Basic longer")).toBe(false);
  });
});
