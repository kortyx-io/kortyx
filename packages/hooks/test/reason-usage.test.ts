import { expect, it } from "vitest";
import { mergeUsage } from "../src/reason/result";

it("preserves mixed Anthropic cache write TTL totals across multiple model calls", () => {
  const usage = mergeUsage(
    {
      input: 100,
      cacheWrite: 30,
      cacheWrite1h: 20,
      inputIncludesCacheWrite: true,
    },
    {
      input: 200,
      cacheWrite: 50,
      cacheWrite1h: 10,
      inputIncludesCacheWrite: true,
    },
  );
  expect(usage).toMatchObject({
    input: 300,
    cacheWrite: 80,
    cacheWrite1h: 30,
    inputIncludesCacheWrite: true,
  });
});
