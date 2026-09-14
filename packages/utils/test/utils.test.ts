import { describe, expect, it, vi } from "vitest";
import {
  contentToText,
  deepMergeWithArrayOverwrite,
  exponentialBackoff,
  fixedDelay,
  withRetries,
} from "../src";

it("does not dispatch after cancellation during retry notification", async () => {
  const controller = new AbortController();
  const failure = new Error("failed");
  const call = vi.fn(async () => {
    throw failure;
  });
  await expect(
    withRetries(call, {
      retries: 2,
      abortSignal: controller.signal,
      onRetry() {
        controller.abort();
      },
    }),
  ).rejects.toHaveProperty("name", "AbortError");
  expect(call).toHaveBeenCalledTimes(1);
});

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

  it("skips non-object sources and overwrites arrays with non-arrays", () => {
    expect(
      deepMergeWithArrayOverwrite(
        { items: ["old"], untouched: true },
        undefined as never,
        { items: { nested: true } },
      ),
    ).toEqual({
      items: { nested: true },
      untouched: true,
    });
  });
});

describe("contentToText", () => {
  it("normalizes strings, blocks, primitives, and objects into text", () => {
    expect(contentToText(null)).toBe("");
    expect(contentToText("hello")).toBe("hello");
    expect(
      contentToText([
        null,
        "prefix-",
        { type: "text", text: "a" },
        { text: "direct" },
        { content: "b" },
        3,
        false,
        Symbol("ignored"),
        { type: "image", url: "ignored" },
      ]),
    ).toBe("prefix-adirectb3false");
    expect(contentToText({ type: "text", text: "single" })).toBe("single");
    expect(contentToText({ text: "single" })).toBe("single");
    expect(contentToText({ content: "content" })).toBe("content");
    expect(contentToText({ value: 1 })).toBe('{"value":1}');
    expect(contentToText(1n)).toBe("1");
  });
});

describe("withRetries", () => {
  it.each([
    "EXECUTION_CANCELLED",
    "EXECUTION_LIMIT_REACHED",
  ])("never retries %s", async (code) => {
    const error = Object.assign(new Error("control flow"), { code });
    const fn = vi.fn(async () => {
      throw error;
    });
    await expect(withRetries(fn, { retries: 3 })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry graph interrupts and aborts an in-flight backoff", async () => {
    const interrupt = Object.assign(new Error("pause"), {
      name: "GraphInterrupt",
    });
    await expect(
      withRetries(
        async () => {
          throw interrupt;
        },
        { retries: 3 },
      ),
    ).rejects.toBe(interrupt);
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      throw new Error("retry candidate");
    });
    const promise = withRetries(fn, {
      retries: 3,
      delayMs: 60_000,
      abortSignal: controller.signal,
      onRetry: () => {
        setTimeout(() => controller.abort(), 0);
      },
    });
    await expect(promise).rejects.toHaveProperty("name", "AbortError");
    expect(fn).toHaveBeenCalledTimes(1);
    await expect(
      withRetries(fn, { retries: 3, abortSignal: controller.signal }),
    ).rejects.toHaveProperty("name", "AbortError");
  });
  it("retries failed attempts and reports retry metadata", async () => {
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
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

  it("normalizes non-error throws and supports function-based retry delays", async () => {
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce("temporary")
      .mockResolvedValueOnce("ok");
    const delayMs = vi.fn(() => -10);

    await expect(withRetries(fn, { retries: 2, delayMs })).resolves.toBe("ok");

    expect(delayMs).toHaveBeenCalledWith(1);
  });

  it("defaults to no delay when retry delay is omitted", async () => {
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error("try again"))
      .mockResolvedValueOnce("ok");

    await expect(withRetries(fn, { retries: 2 })).resolves.toBe("ok");

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("waits before retrying when a positive delay is configured", async () => {
    vi.useFakeTimers();
    try {
      const fn = vi
        .fn<(attempt: number) => Promise<string>>()
        .mockRejectedValueOnce(new Error("try again"))
        .mockResolvedValueOnce("ok");

      const result = withRetries(fn, { retries: 2, delayMs: 10 });
      await vi.runAllTimersAsync();

      await expect(result).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("computes bounded exponential backoff delays", () => {
    const backoff = exponentialBackoff(10, 3, 50);

    expect(backoff(1)).toBe(10);
    expect(backoff(2)).toBe(30);
    expect(backoff(4)).toBe(50);
    expect(fixedDelay(-10)(1)).toBe(0);
  });
});
