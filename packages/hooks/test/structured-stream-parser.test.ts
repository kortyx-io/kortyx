import { describe, expect, it } from "vitest";
import {
  extractCompletedArrayItems,
  extractCompletedFieldValue,
  extractStreamingStringValue,
  resolveAppendFieldPaths,
  resolveSetFieldPaths,
  resolveTextDeltaFieldPaths,
} from "../src/reason/structured-stream";

describe("structured stream parser", () => {
  it("resolves configured field paths by streaming mode", () => {
    const config = {
      fields: {
        title: "set",
        body: "text-delta",
        jobs: "append",
      },
    } as const;

    expect(resolveSetFieldPaths(config)).toEqual(["title"]);
    expect(resolveTextDeltaFieldPaths(config)).toEqual(["body"]);
    expect(resolveAppendFieldPaths(config)).toEqual(["jobs"]);
    expect(resolveSetFieldPaths(undefined)).toEqual([]);
    expect(resolveTextDeltaFieldPaths({})).toEqual([]);
    expect(resolveAppendFieldPaths({})).toEqual([]);
  });

  it("rejects nested structured streaming field paths before streaming starts", () => {
    expect(() =>
      resolveSetFieldPaths({
        fields: {
          "meta.title": "set",
        },
      }),
    ).toThrow(
      "useReason structured set streaming requires non-empty top-level field keys.",
    );

    expect(() =>
      resolveTextDeltaFieldPaths({
        fields: {
          "body.markdown": "text-delta",
        },
      }),
    ).toThrow(
      "useReason structured text-delta streaming requires non-empty top-level string field keys.",
    );

    expect(() =>
      resolveAppendFieldPaths({
        fields: {
          "jobs.items": "append",
        },
      }),
    ).toThrow(
      "useReason structured append streaming requires non-empty top-level array field keys.",
    );
  });

  it("extracts completed scalar, string, object, and array field values", () => {
    const text = JSON.stringify({
      title: 'Hello "Kortyx"',
      count: 3,
      enabled: true,
      details: {
        braces: "literal } inside string",
        nested: ["a", { ok: true }],
      },
      tags: ["sdk", "stream"],
    });

    expect(extractCompletedFieldValue({ text, path: "title" })).toEqual({
      found: true,
      complete: true,
      value: 'Hello "Kortyx"',
    });
    expect(extractCompletedFieldValue({ text, path: "count" })).toEqual({
      found: true,
      complete: true,
      value: 3,
    });
    expect(extractCompletedFieldValue({ text, path: "enabled" })).toEqual({
      found: true,
      complete: true,
      value: true,
    });
    expect(extractCompletedFieldValue({ text, path: "details" })).toEqual({
      found: true,
      complete: true,
      value: {
        braces: "literal } inside string",
        nested: ["a", { ok: true }],
      },
    });
    expect(extractCompletedFieldValue({ text, path: "tags" })).toEqual({
      found: true,
      complete: true,
      value: ["sdk", "stream"],
    });
  });

  it("reports incomplete or missing field values without inventing data", () => {
    expect(
      extractCompletedFieldValue({
        text: '{"title":',
        path: "title",
      }),
    ).toEqual({
      found: true,
      complete: false,
    });
    expect(
      extractCompletedFieldValue({
        text: '{"title":"unterminated',
        path: "title",
      }),
    ).toEqual({
      found: true,
      complete: false,
    });
    expect(
      extractCompletedFieldValue({
        text: '{"details":{"ok":true',
        path: "details",
      }),
    ).toEqual({
      found: true,
      complete: false,
    });
    expect(
      extractCompletedFieldValue({
        text: '{"details":{bad:1}}',
        path: "details",
      }),
    ).toEqual({
      found: true,
      complete: false,
    });
    expect(
      extractCompletedFieldValue({
        text: '{"count":,',
        path: "count",
      }),
    ).toEqual({
      found: true,
      complete: false,
    });
    expect(
      extractCompletedFieldValue({
        text: '{"count":123',
        path: "count",
      }),
    ).toEqual({
      found: true,
      complete: false,
    });
    expect(
      extractCompletedFieldValue({
        text: '{"title":bad,',
        path: "title",
      }),
    ).toEqual({
      found: true,
      complete: false,
    });
    expect(
      extractCompletedFieldValue({
        text: '{"other":"value"}',
        path: "title",
      }),
    ).toEqual({
      found: false,
      complete: false,
    });
  });

  it("extracts escaped completed string fields and rejects unknown escapes as incomplete", () => {
    expect(
      extractCompletedFieldValue({
        text: String.raw`{"title":"quote: \" slash: \/ backslash: \\ line:\n tab:\t"}`,
        path: "title",
      }),
    ).toEqual({
      found: true,
      complete: true,
      value: 'quote: " slash: / backslash: \\ line:\n tab:\t',
    });

    expect(
      extractCompletedFieldValue({
        text: String.raw`{"title":"bad escape: \x"}`,
        path: "title",
      }),
    ).toEqual({
      found: true,
      complete: false,
    });
  });

  it("extracts completed array items while ignoring partial malformed tail items", () => {
    const text =
      '{"jobs":[{"id":"1","meta":{"tags":["a,b","]"]}},["nested",2],true,null,';

    expect(extractCompletedArrayItems({ text, path: "jobs" })).toEqual([
      {
        id: "1",
        meta: {
          tags: ["a,b", "]"],
        },
      },
      ["nested", 2],
      true,
      null,
    ]);
    expect(extractCompletedArrayItems({ text, path: "missing" })).toEqual([]);
  });

  it("keeps completed array strings intact when they contain escaped delimiters", () => {
    const text = String.raw`{"jobs":["a,b","quote: \"ok\"",{"nested":["]"]},bad,`;

    expect(extractCompletedArrayItems({ text, path: "jobs" })).toEqual([
      "a,b",
      'quote: "ok"',
      {
        nested: ["]"],
      },
    ]);
  });

  it("streams string values with escapes, partial escapes, and unicode escapes", () => {
    expect(
      extractStreamingStringValue({
        text: '{"body":"Hello\\nWorld"}',
        path: "body",
      }),
    ).toEqual({
      found: true,
      complete: true,
      value: "Hello\nWorld",
    });
    expect(
      extractStreamingStringValue({
        text: '{"body":"Snowman: \\u2603"}',
        path: "body",
      }),
    ).toEqual({
      found: true,
      complete: true,
      value: "Snowman: \u2603",
    });
    expect(
      extractStreamingStringValue({
        text: '{"body":"partial\\',
        path: "body",
      }),
    ).toEqual({
      found: true,
      complete: false,
      value: "partial",
    });
    expect(
      extractStreamingStringValue({
        text: '{"body":"bad\\u26"}',
        path: "body",
      }),
    ).toEqual({
      found: true,
      complete: false,
      value: "bad",
    });
    expect(
      extractStreamingStringValue({
        text: String.raw`{"body":"bad\x"}`,
        path: "body",
      }),
    ).toEqual({
      found: true,
      complete: false,
      value: "bad",
    });
    expect(
      extractStreamingStringValue({
        text: '{"other":"value"}',
        path: "body",
      }),
    ).toEqual({
      found: false,
      complete: false,
      value: "",
    });
  });
});
