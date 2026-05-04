import type { InterruptInput } from "@kortyx/core";
import { toJSONSchema } from "zod";
import type { SchemaLike } from "../types";

const tryStringify = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const tryGetSchemaHint = (schema: unknown): string | undefined => {
  try {
    const hint = toJSONSchema(schema as never);
    return JSON.stringify(hint, null, 2);
  } catch {
    return undefined;
  }
};

const withSchemaHint = (
  input: string,
  label: string,
  schema: unknown,
): string => {
  const hint = tryGetSchemaHint(schema);
  if (!hint) return input;
  return `${input}\n\n${label}:\n${hint}`;
};

export const defaultInterruptFirstPassInput = (args: {
  input: string;
  requestSchema: SchemaLike<unknown>;
  outputSchema?: SchemaLike<unknown>;
  mode?: "required" | "optional" | undefined;
}): string => {
  const mode = args.mode ?? "required";
  const base =
    mode === "optional"
      ? args.outputSchema
        ? [
            args.input,
            "Output rules:",
            "- Return JSON only. No markdown fences.",
            "- Return an object with keys: decision, output, interruptRequest, draftText.",
            '- decision must be either "continue" or "interrupt".',
            '- Use decision "continue" when you can produce the final output without asking the user.',
            '- Use decision "interrupt" only when user input is needed before finalizing.',
            "- output must match the expected output JSON schema.",
            '- When decision is "interrupt", interruptRequest must match the expected interrupt request JSON schema and must be a non-null object.',
            '- When decision is "continue", interruptRequest must be null.',
            "- draftText should be a concise plain-language summary of output.",
          ].join("\n\n")
        : [
            args.input,
            "Output rules:",
            "- Return JSON only. No markdown fences.",
            "- Return an object with keys: decision, draftText, interruptRequest.",
            '- decision must be either "continue" or "interrupt".',
            '- Use decision "continue" when you can produce the final answer without asking the user.',
            '- Use decision "interrupt" only when user input is needed before finalizing.',
            "- draftText should be the current answer text.",
            '- When decision is "interrupt", interruptRequest must match the expected interrupt request JSON schema and must be a non-null object.',
            '- When decision is "continue", interruptRequest must be null.',
          ].join("\n\n")
      : args.outputSchema
        ? [
            args.input,
            "Output rules:",
            "- Return JSON only. No markdown fences.",
            "- Return an object with keys: output, interruptRequest, draftText.",
            "- output must match the expected output JSON schema.",
            "- interruptRequest must match the expected interrupt request JSON schema.",
            "- interruptRequest must be a non-null object.",
            "- draftText should be a concise plain-language summary of output.",
            "- If uncertain, still return a valid interruptRequest with safe default options.",
          ].join("\n\n")
        : [
            args.input,
            "Output rules:",
            "- Return JSON only. No markdown fences.",
            "- Return an object with keys: draftText, interruptRequest.",
            "- draftText should be the current draft answer text.",
            "- interruptRequest must match the expected interrupt request JSON schema.",
            "- interruptRequest must be a non-null object.",
            "- If uncertain, still return a valid interruptRequest with safe default options.",
          ].join("\n\n");

  const withInterruptSchema = withSchemaHint(
    base,
    "Expected interrupt request JSON schema (for `interruptRequest`)",
    args.requestSchema,
  );

  if (!args.outputSchema) return withInterruptSchema;
  const withOutputSchema = withSchemaHint(
    withInterruptSchema,
    "Expected output JSON schema (for `output`)",
    args.outputSchema,
  );
  return [
    withOutputSchema,
    "JSON template:",
    mode === "optional"
      ? '{ "decision": "continue", "output": { ... }, "interruptRequest": null, "draftText": "..." }'
      : '{ "output": { ... }, "interruptRequest": { ... }, "draftText": "..." }',
  ].join("\n\n");
};

export const defaultContinuationInput = (args: {
  input: string;
  draftText: string;
  draftOutput?: unknown;
  request: InterruptInput;
  response: unknown;
}): string =>
  [
    "You are continuing a paused reasoning task after user input.",
    "Update the previous result using the user response and return the final answer only.",
    "If the previous output was JSON, return JSON in the same schema.",
    "",
    `Original request:\n${args.input}`,
    `Draft answer text:\n${args.draftText}`,
    `Draft output object:\n${tryStringify(args.draftOutput ?? args.draftText)}`,
    `Interrupt request shown to user:\n${tryStringify(args.request)}`,
    `User response:\n${tryStringify(args.response)}`,
  ].join("\n\n");

export const withOutputGuardrails = (
  input: string,
  schema?: SchemaLike<unknown>,
): string => {
  const base = [
    input,
    "Output rules:",
    "- Return only JSON, no markdown fences.",
    "- Ensure the response conforms to the expected output schema.",
    "- Do not include explanatory text outside the JSON object.",
  ].join("\n\n");
  return withSchemaHint(base, "Expected output JSON schema", schema);
};

export const withStructuredStreamHints = (
  input: string,
  args: {
    setFieldPaths?: string[];
    appendFieldPaths?: string[];
    textDeltaFieldPaths?: string[];
  },
): string => {
  const rules: string[] = [];

  for (const path of args.setFieldPaths ?? []) {
    rules.push(
      `- For the top-level field \`${path}\`, write one stable final value and do not rewrite it after it is complete.`,
    );
  }

  for (const path of args.appendFieldPaths ?? []) {
    rules.push(
      `- For the top-level array field \`${path}\`, write items in final order and finish each item before starting the next.`,
    );
    rules.push(
      `- Once an item in \`${path}\` is complete, do not rewrite or reorder earlier items.`,
    );
  }

  for (const path of args.textDeltaFieldPaths ?? []) {
    rules.push(
      `- For the top-level string field \`${path}\`, write the value progressively by appending text to the end.`,
    );
    rules.push(
      `- Do not rewrite or replace the earlier prefix of \`${path}\` once emitted.`,
    );
  }

  if (rules.length === 0) return input;

  return [
    input,
    "Streaming rules:",
    ...rules,
    "- Keep the overall response as valid JSON.",
  ].join("\n\n");
};
