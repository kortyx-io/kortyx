import { describe, expect, it } from "vitest";
import { trimTrailingSlashes } from "../src/url";

describe("trimTrailingSlashes", () => {
  it("removes all trailing URL separators", () => {
    expect(trimTrailingSlashes("https://provider.test/v1///")).toBe(
      "https://provider.test/v1",
    );
    expect(trimTrailingSlashes("https://provider.test/v1")).toBe(
      "https://provider.test/v1",
    );
  });

  it("handles long untrusted suffixes in linear time", () => {
    expect(
      trimTrailingSlashes(`https://provider.test/${"/".repeat(100_000)}`),
    ).toBe("https://provider.test");
  });
});
