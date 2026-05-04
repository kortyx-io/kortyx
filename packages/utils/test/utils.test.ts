import { describe, expect, it, vi } from "vitest";
import {
  contentToText,
  deepMergeWithArrayOverwrite,
  exponentialBackoff,
  fixedDelay,
  withRetries,
} from "../src";

describe("deepMergeWithArrayOverwrite", () => {
  it("deep merges plain objects while replacing arrays", () => {
    expect(
      deepMergeWithArrayOverwrite(
        { flags: { a: true }, items: ["old"], scalar: 1 },
        { flags: { b: true }, items: ["new"], scalar: 2 },
      ),
    ).toEqual({
      flags: { a: true, b: true },
      items: ["new"],
      scalar: 2,
    });
  });
});

describe("contentToText", () => {
  it("normalizes strings, blocks, primitives, and objects into text", () => {
    expect(contentToText(null)).toBe("");
    expect(contentToText("hello")).toBe("hello");
    expect(
      contentToText([
        { type: "text", text: "a" },
        { content: "b" },
        3,
        false,
        { type: "image", url: "ignored" },
      ]),
    ).toBe("ab3false");
    expect(contentToText({ text: "single" })).toBe("single");
    expect(contentToText({ value: 1 })).toBe('{"value":1}');
  });
});

describe("withRetries", () => {
  it("retries failed attempts and reports retry metadata", async () => {
    const fn = vi
      .fn<[(attempt: number) => Promise<string>]>()
      .mockRejectedValueOnce(new Error("try again"))
      .mockResolvedValueOnce("ok");
    const onRetry = vi.fn();

    await expect(
      withRetries(fn, { retries: 2, delayMs: fixedDelay(0), onRetry }),
    ).resolves.toBe("ok");

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 1);
    expect(fn).toHaveBeenNthCalledWith(2, 2);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it("stops when retryOn declines and clamps retry counts", async () => {
    const error = new Error("fatal");
    const fn = vi.fn(async () => {
      throw error;
    });

    await expect(
      withRetries(fn, { retries: 3, retryOn: () => false }),
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);

    await expect(withRetries(fn, { retries: 0 })).rejects.toThrow("fatal");
  });

  it("computes bounded exponential backoff delays", () => {
    const backoff = exponentialBackoff(10, 3, 50);

    expect(backoff(1)).toBe(10);
    expect(backoff(2)).toBe(30);
    expect(backoff(4)).toBe(50);
  });
});
