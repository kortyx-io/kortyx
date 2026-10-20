import type {
  EvalCheck,
  EvalCheckResult,
  EvalJson,
  EvalObservation,
} from "./types";

/** Serializable assertions, interpreted by the application runner before semantic grading. */
export const evalChecks = {
  textEquals: (
    value: string,
    options?: { ignoreCase?: boolean },
  ): EvalCheck => ({
    type: "text-equals",
    value,
    ...(options?.ignoreCase === undefined
      ? {}
      : { ignoreCase: options.ignoreCase }),
  }),
  textContains: (value: string): EvalCheck => ({
    type: "text-contains",
    value,
  }),
  textMatches: (pattern: string, flags?: string): EvalCheck => ({
    type: "text-matches",
    pattern,
    ...(flags === undefined ? {} : { flags }),
  }),
  toolCalled: (tool: string): EvalCheck => ({ type: "tool-called", tool }),
  toolInputEquals: (tool: string, input: EvalJson): EvalCheck => ({
    type: "tool-input-equals",
    tool,
    input,
  }),
  outputEquals: (options: {
    schemaId: string;
    schemaVersion?: string;
    path: readonly (string | number)[];
    value: EvalJson;
  }): EvalCheck => ({ type: "output-equals", ...options }),
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** JSON equality ignores object key order and preserves array order and scalar types. */
function equal(actual: unknown, expected: EvalJson): boolean {
  if (actual === expected) return true;
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => equal(actual[index], value))
    );
  if (!object(expected) || !object(actual)) return false;
  return (
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(
      ([key, value]) =>
        Object.hasOwn(actual, key) && equal(actual[key], value as EvalJson),
    )
  );
}

function atPath(value: unknown, path: readonly (string | number)[]): unknown {
  for (const segment of path) {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, segment)
    )
      return undefined;
    value = (value as Record<string | number, unknown>)[segment];
  }
  return value;
}

/** Uses current, full captured evidence; judge evidence filters do not alter deterministic checks. */
export function evaluateChecks(
  checks: readonly EvalCheck[],
  observation: EvalObservation,
): EvalCheckResult[] {
  const calls = (observation.events ?? []).filter(
    (event) =>
      object(event) &&
      [
        "tool-call-start",
        "tool-call-result",
        "tool-call-error",
        "tool-result",
      ].includes(String(event.type)),
  );
  return checks.map((check, index) => {
    let passed = false;
    let reason: string;
    let evidence: string[] = [];
    switch (check.type) {
      case "text-equals":
        passed = check.ignoreCase
          ? observation.text.toLowerCase() === check.value.toLowerCase()
          : observation.text === check.value;
        reason = passed
          ? "The answer equals the expected text."
          : "The answer does not equal the expected text.";
        if (passed) evidence = [observation.text];
        break;
      case "text-contains":
        passed = observation.text.includes(check.value);
        reason = passed
          ? "The answer contains the required text."
          : "The answer does not contain the required text.";
        if (passed) evidence = [check.value];
        break;
      case "text-matches": {
        const match = new RegExp(check.pattern, check.flags).exec(
          observation.text,
        );
        passed = match !== null;
        reason = passed
          ? "The answer matches the regular expression."
          : "The answer does not match the regular expression.";
        if (match?.[0]) evidence = [match[0]];
        break;
      }
      case "tool-called":
      case "tool-input-equals": {
        const match = calls.find(
          (event) =>
            object(event) &&
            event.tool === check.tool &&
            (check.type === "tool-called" ||
              (event.type === "tool-call-start" &&
                Object.hasOwn(event, "input") &&
                equal(event.input, check.input))),
        );
        passed = match !== undefined;
        reason = passed
          ? "A matching tool call was observed."
          : "No matching tool call was observed. Enable tool emission and check the captured name and arguments; missing evidence does not prove a tool was never called.";
        if (match) evidence = [JSON.stringify(match)];
        break;
      }
      case "output-equals": {
        const match = observation.structured.find(
          (output) =>
            object(output) &&
            output.status === "done" &&
            output.schemaId === check.schemaId &&
            (check.schemaVersion === undefined ||
              output.schemaVersion === check.schemaVersion) &&
            equal(atPath(output.data, check.path), check.value),
        );
        passed = match !== undefined;
        reason = passed
          ? "A completed structured output contains the expected value."
          : "No matching completed structured output contains the expected value at the specified path.";
        if (match !== undefined) evidence = [JSON.stringify(match)];
        break;
      }
    }
    return { index, check, passed, reason, evidence };
  });
}
