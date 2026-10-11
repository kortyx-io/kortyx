import { describe, expect, it, vi } from "vitest";
import { captureDiagnosticContent } from "../src/diagnostic-capture";

const chain = () => {
  let error = new Error("root rejection");
  for (let index = 0; index < 16; index++)
    error = new Error(`cause-${index}`, { cause: error });
  return error;
};
describe("complete diagnostic capture", () => {
  it("preserves large UTF-8 fields, full message/stack, deep causes, aggregates and graph references", () => {
    const member = chain();
    const error = Object.assign(
      new AggregateError([member, new Error("second")], "M".repeat(12000), {
        cause: member,
      }),
      {
        status: 400,
        responseBody: "ü".repeat(60 * 1024),
        metadata: { raw: { reason: "rejection" } },
      },
    );
    error.stack = "S".repeat(40000);
    Object.assign(error.metadata.raw, { cycle: error, sibling: "retained" });
    const content = captureDiagnosticContent(error);
    expect(content?.capture.status).toBe("complete");
    expect(content?.data).toMatchObject({
      type: "AggregateError",
      message: error.message,
      stack: error.stack,
      status: 400,
      responseBody: error.responseBody,
      metadata: { raw: { cycle: { $ref: "#/data" }, sibling: "retained" } },
    });
    const cause = content?.data.cause as Record<string, unknown>;
    let cursor = cause;
    for (let index = 0; index < 16; index++)
      cursor = cursor.cause as Record<string, unknown>;
    expect(cursor.message).toBe("root rejection");
    expect(content?.data.errors).toEqual([
      { $ref: "#/data/cause" },
      expect.objectContaining({ message: "second" }),
    ]);
  });
  it("redacts keys and credentials in text and custom projections before serialization", () => {
    const content = captureDiagnosticContent(new Error("ignored"), () => ({
      type: "ProviderError",
      message:
        "Bearer secret-token token=plain-secret https://user:pass@host/?api_key=query-secret",
      responseBody: '{"token":"json-secret","reason":"invalid model"}',
      metadata: {
        authorization: "header-secret",
        password: "password-secret",
        "x-api-key": "x-header-secret",
        awsSecretAccessKey: "aws-secret",
        raw: "retained",
      },
    }));
    const bytes = JSON.stringify(content);
    for (const secret of [
      "secret-token",
      "plain-secret",
      "user:pass",
      "query-secret",
      "json-secret",
      "header-secret",
      "password-secret",
      "x-header-secret",
      "aws-secret",
    ])
      expect(bytes).not.toContain(secret);
    expect(bytes).toContain("invalid model");
    expect(content?.capture.redactions.length).toBeGreaterThan(0);
    expect(content?.capture.status).toBe("complete");
  });
  it("does not call getters or toJSON and keeps unrelated siblings", () => {
    const getter = vi.fn(() => {
      throw new Error("must not execute");
    });
    const data = Object.defineProperty(
      { message: "test", unrelated: "retained", toJSON: getter },
      "bad",
      { get: getter, enumerable: true },
    );
    const content = captureDiagnosticContent(data);
    expect(getter).not.toHaveBeenCalled();
    expect(content?.data.unrelated).toBe("retained");
    expect(content?.capture.status).toBe("partial");
    expect(content?.capture.omissions).toContainEqual({
      path: "#/data/bad",
      reason: "accessor_not_evaluated",
    });
  });
  it("marks oversized fields with their original size while retaining siblings", () => {
    const content = captureDiagnosticContent({
      message: "test",
      responseBody: "X".repeat(9 * 1024 * 1024),
      sibling: "retained",
    });
    expect(content?.capture.status).toBe("partial");
    expect(content?.capture.omissions).toContainEqual({
      path: "#/data/responseBody",
      reason: "byte_limit",
      originalBytes: 9 * 1024 * 1024,
    });
    expect(content?.data.sibling).toBe("retained");
  });
  it("supports unusual values and bounded native collections", () => {
    const content = captureDiagnosticContent({
      message: "test",
      bigint: 4n,
      date: new Date("2026-10-08T00:00:00Z"),
      map: new Map([["ok", 3]]),
      set: new Set(["a"]),
      large: new Set(Array.from({ length: 1100 }, (_, i) => i)),
    });
    expect(content?.data).toMatchObject({
      bigint: { $type: "bigint", value: "4" },
      date: { $type: "Date", value: "2026-10-08T00:00:00.000Z" },
      map: { $type: "Map", entries: [["ok", 3]] },
      set: { $type: "Set", values: ["a"] },
    });
    expect(content?.capture.omissions).toContainEqual({
      path: "#/data/large",
      reason: "collection_limit",
      originalCount: 1100,
    });
  });
  it("supports suppression and explicit projection failures", () => {
    expect(captureDiagnosticContent(new Error("test"), () => null)).toBeNull();
    expect(
      captureDiagnosticContent(new Error("test"), () => {
        throw new Error("private");
      })?.capture.status,
    ).toBe("failed");
  });
});

it("captures Node lazy stacks without invoking an application's formatter or a custom stack getter", () => {
  const formatter = Object.getOwnPropertyDescriptor(Error, "prepareStackTrace");
  const custom = vi.fn(() => "application formatter");
  Object.defineProperty(Error, "prepareStackTrace", {
    value: custom,
    configurable: true,
    writable: true,
  });
  try {
    const error = new Error("native stack");
    expect(captureDiagnosticContent(error)?.data.stack).toContain(
      "Error: native stack",
    );
    expect(custom).not.toHaveBeenCalled();
    expect(
      Object.getOwnPropertyDescriptor(Error, "prepareStackTrace")?.value,
    ).toBe(custom);
    const getter = vi.fn(() => "secret stack");
    Object.defineProperty(error, "stack", { get: getter });
    const content = captureDiagnosticContent(error);
    expect(content?.capture.status).toBe("partial");
    expect(getter).not.toHaveBeenCalled();
  } finally {
    if (formatter) Object.defineProperty(Error, "prepareStackTrace", formatter);
    else Reflect.deleteProperty(Error, "prepareStackTrace");
  }
});

it("does not coerce custom error names while formatting a native lazy stack", () => {
  const coercion = vi.fn(() => "CustomError");
  const error = Object.assign(new Error("failure"), {
    name: { toString: coercion },
    unrelated: "retained",
  });
  const content = captureDiagnosticContent(error);
  expect(coercion).not.toHaveBeenCalled();
  expect(content?.data.unrelated).toBe("retained");
  expect(content?.capture.status).toBe("partial");
});
