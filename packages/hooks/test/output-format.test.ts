import { describe, expect, it } from "vitest";
import { z } from "zod";
import { inferOutputFormat } from "../src/reason/output-format";

describe("output schema inference", () => {
  it("infers strict nested Zod schemas without default annotations", () => {
    const result = inferOutputFormat(
      z.object({ items: z.array(z.object({ value: z.string() })).default([]) }),
      undefined,
    );
    expect(result.responseFormat).toMatchObject({
      type: "json",
      schema: {
        type: "object",
        required: ["items"],
        additionalProperties: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('"default"');
    expect(result.warnings).toBeUndefined();
  });
  it.each([
    z.object({ value: z.string().optional() }),
    z.object({ values: z.record(z.string(), z.number()) }),
    z.object({
      value: z.intersection(
        z.object({ a: z.string() }),
        z.object({ b: z.string() }),
      ),
    }),
    z.object({ value: z.tuple([z.string(), z.number()]) }),
    z.object({ value: z.string().transform((v) => v.length) }),
    z.string(),
    {
      safeParse: (value: unknown) => ({ success: true as const, data: value }),
    },
  ])("warns and preserves local validators when inference is unavailable %#", (schema) => {
    expect(inferOutputFormat(schema, undefined)).toMatchObject({
      responseFormat: { type: "json" },
      warnings: [{ feature: "outputSchema" }],
    });
  });
  it("preserves explicit formats and does nothing without a schema", () => {
    expect(
      inferOutputFormat(z.object({ value: z.string() }), { type: "text" }),
    ).toEqual({ responseFormat: { type: "text" } });
    expect(inferOutputFormat(undefined, undefined)).toEqual({});
  });
  it("preserves property names that look like JSON Schema keywords", () => {
    const result = inferOutputFormat(
      z.object({
        default: z.string().default("x"),
        $schema: z.string(),
        type: z.string(),
      }),
      undefined,
    );
    expect(result.responseFormat).toMatchObject({
      type: "json",
      schema: {
        properties: {
          default: { type: "string" },
          $schema: { type: "string" },
          type: { type: "string" },
        },
        required: ["default", "$schema", "type"],
      },
    });
    expect(result.warnings).toBeUndefined();
  });
});
