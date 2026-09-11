import { describe, expect, it, vi } from "vitest";
import { createProvider } from "../src";

describe("Google explicit reasoning failures", () => {
  it.each([
    true,
    false,
  ])("never retries a rejected effort (stream=%s)", async (stream) => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Thinking level is not supported for this model.",
            },
          }),
          { status: 400 },
        ),
    );
    const model = createProvider({ apiKey: "test-key", fetch }).getModel(
      "gemini-3-flash-preview",
      { reasoning: { effort: "medium" } },
    );
    if (stream) {
      const parts = [];
      for await (const part of await model.stream([
        { role: "user", content: "hi" },
      ]))
        parts.push(part);
      expect(parts).toEqual([expect.objectContaining({ type: "error" })]);
    } else
      await expect(
        model.invoke([{ role: "user", content: "hi" }]),
      ).rejects.toThrow("Thinking level");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects conflicting reasoning controls without a request", async () => {
    const fetch = vi.fn();
    const model = createProvider({ apiKey: "test-key", fetch }).getModel(
      "gemini-2.5-flash",
      { reasoning: { effort: "low", maxTokens: 128 } },
    );
    await expect(
      model.invoke([{ role: "user", content: "hi" }]),
    ).rejects.toThrow("either effort or maxTokens");
    expect(fetch).not.toHaveBeenCalled();
  });
});
