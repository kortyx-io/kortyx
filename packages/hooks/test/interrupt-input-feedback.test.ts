import { ValidationError } from "@kortyx/core/errors";
import { expect, it } from "vitest";
import { interruptInputFeedback } from "../src/reason/input-feedback";

it("describes advertised fields and array positions without echoing values, record keys, or custom messages", () => {
  const schema = {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        items: { type: "object", properties: { id: { type: "string" } } },
      },
      details: { type: "object" },
    },
  };
  const error = new ValidationError("SCHEMA_VALIDATION", "private", {
    issues: [
      { path: ["candidates", 0, "id"], message: "private submitted value" },
      {
        path: ["details", "person@example.test"],
        message: "private dynamic key",
      },
      { path: ["unknown-secret-key"] },
      { path: ["candidates", -1] },
      { path: ["candidates", Number.NaN] },
      { path: ["candidates", 3, "id"] },
    ],
  });
  const feedback = interruptInputFeedback(
    error,
    schema,
    "request_input",
    false,
  );
  expect(feedback).toContain("candidates[0].id");
  expect(feedback).toContain("details must satisfy");
  expect(feedback).toContain("Additional input fields");
  expect(feedback).not.toMatch(/private|person@example|unknown-secret/);
});

it("keeps required human input policy and tolerates missing or malformed issue details", () => {
  const error = new ValidationError("SCHEMA_VALIDATION", "private");
  expect(interruptInputFeedback(error, {}, "request", true)).toContain(
    "Human input is required",
  );
  const malformed = new ValidationError("SCHEMA_VALIDATION", "private", {
    issues: [null, { path: "bad" }, { path: ["x", "y"] }],
  });
  expect(
    interruptInputFeedback(malformed, undefined, "request", false),
  ).not.toContain("private");
  expect(
    interruptInputFeedback(
      malformed,
      { properties: { x: "not-a-schema" } },
      "request",
      false,
    ),
  ).toContain("x must satisfy");
});
