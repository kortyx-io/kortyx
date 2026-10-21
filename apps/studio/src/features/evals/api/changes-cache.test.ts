import { afterEach, expect, it, vi } from "vitest";
import type { ConversationChange } from "../lib/evaluation-changes";
import { ChangesCache, changesCacheKey } from "./changes-cache";

vi.mock("server-only", () => ({}));
afterEach(() => vi.useRealTimers());
const rows = (name: string) => [{ name }] as ConversationChange[];

it("evicts least-recently-used entries, caps bytes and expires even recently accessed values", () => {
  vi.useFakeTimers();
  const cache = new ChangesCache(100, 2, 1000);
  cache.set("a", rows("a"));
  cache.set("b", rows("b"));
  expect(cache.get("a")).toEqual(rows("a"));
  cache.set("c", rows("c"));
  expect(cache.get("b")).toBeUndefined();
  cache.set("oversize", rows("x".repeat(200)));
  expect(cache.get("oversize")).toBeUndefined();
  cache.set("d", rows("x".repeat(60)));
  expect(cache.get("a")).toBeUndefined();
  vi.advanceTimersByTime(1001);
  expect(cache.get("d")).toBeUndefined();
});

it("separates credentials and result versions without retaining their values in keys", () => {
  const key = changesCacheKey(
    { authorization: "secret", projectId: "customer" },
    ["a", "b"],
  );
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(key).not.toContain("secret");
  expect(
    changesCacheKey({ authorization: "other", projectId: "customer" }, [
      "a",
      "b",
    ]),
  ).not.toBe(key);
  expect(
    changesCacheKey({ authorization: "secret", projectId: "customer" }, [
      "a",
      "c",
    ]),
  ).not.toBe(key);
});
