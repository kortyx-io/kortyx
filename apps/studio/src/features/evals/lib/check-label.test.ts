import { expect, it } from "vitest";
import { evalCheckLabel } from "./check-label";

it("describes the non-whitespace assertion without mislabeling other regexes", () => {
  expect(
    evalCheckLabel({ type: "text-matches", pattern: String.raw`\S` }),
  ).toBe("Answer contains text");
  expect(
    evalCheckLabel({ type: "text-matches", pattern: String.raw`\\S` }),
  ).not.toBe("Answer contains text");
  expect(
    evalCheckLabel({ type: "text-matches", pattern: "^hello$", flags: "i" }),
  ).toBe("Answer matches /^hello$/i");
});
