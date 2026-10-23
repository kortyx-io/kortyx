import type { ValidationError } from "@kortyx/core/errors";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Use only paths advertised in the tool schema, never user-authored record keys. */
export function schemaPath(schema: unknown, path: unknown[]): string {
  let current = schema;
  let label = "";
  for (const part of path.slice(0, 8)) {
    if (!record(current)) break;
    if (typeof part === "number" && Number.isSafeInteger(part) && part >= 0) {
      if (!record(current.items)) break;
      current = current.items;
      label += `[${part}]`;
    } else if (
      typeof part === "string" &&
      record(current.properties) &&
      Object.hasOwn(current.properties, part)
    ) {
      current = current.properties[part];
      label += `${label ? "." : ""}${part.slice(0, 64)}`;
    } else break;
  }
  return label || "input";
}

export function interruptInputFeedback(
  error: ValidationError,
  schema: unknown,
  name: string,
  required: boolean,
): string {
  const issues = Array.isArray(error.issues) ? error.issues : [];
  const problems = issues.slice(0, 5).map((issue: unknown) => {
    const path = record(issue) && Array.isArray(issue.path) ? issue.path : [];
    return `- ${schemaPath(schema, path)} must satisfy its declared input schema.`;
  });
  return [
    `Invalid input for ${name}:`,
    ...problems,
    ...(issues.length > 5 ? ["- Additional input fields are invalid."] : []),
    required
      ? "Correct the input and call the tool again. Human input is required before finishing."
      : "Correct the input and call the tool again, or finish without requesting human input when none is needed.",
  ].join("\n");
}
