import { createHash } from "node:crypto";
import {
  canonicalPromptJson,
  compilePrompt,
  definePrompt,
  PromptContentSchema,
  PromptError,
  type PromptVariables,
  promptVariables,
  promptVariablesFor,
  validatePromptContent,
} from "@kortyx/prompts";
import { z } from "zod";
import { EvalObservationSchema } from "./contracts";
import { compactEvalObservation } from "./evidence";
import {
  type EvalJudgePrompt,
  EvalJudgePromptSchema,
} from "./judge-prompt-contracts";
import type { EvalGradeInput } from "./types";

const observation = z.object({
  type: EvalObservationSchema.shape.type,
  text: z.string(),
  structured: z.array(z.json()),
  events: z.array(z.json()).default([]),
  interrupt: EvalObservationSchema.shape.interrupt
    .unwrap()
    .nullable()
    .default(null),
});
export const evalJudgeVariablesSchema = z.object({
  criterion: z.object({ id: z.string(), text: z.string() }),
  input: z.union([
    z.object({ message: z.string() }),
    z.object({ resume: z.json() }),
  ]),
  observation,
  reference: z.json().nullable(),
  conversation: z.array(z.object({ input: z.json(), observation })),
});
export type EvalJudgeVariables = z.infer<typeof evalJudgeVariablesSchema>;
type Message = { role: "system" | "user" | "assistant"; content: string };

function allowedPath(path: string): boolean {
  let schema: unknown = z.toJSONSchema(evalJudgeVariablesSchema);
  for (const key of path.split(".")) {
    if (["__proto__", "constructor", "prototype"].includes(key)) return false;
    const object = schema as { properties?: Record<string, unknown> };
    if (!object?.properties || !Object.hasOwn(object.properties, key))
      return false;
    schema = object.properties[key];
  }
  return true;
}

/** Evaluated once with symbolic inputs; the saved definition contains no executable code. */
export function defineJudgePrompt(options: {
  id: string;
  version?: number;
  format?: "chat" | "system-user";
  messages:
    | readonly Message[]
    | ((variables: PromptVariables<EvalJudgeVariables>) => readonly Message[]);
}): EvalJudgePrompt {
  const messages =
    typeof options.messages === "function"
      ? options.messages(promptVariablesFor<EvalJudgeVariables>())
      : options.messages;
  const content = PromptContentSchema.parse({
    format:
      options.format ??
      (messages.length === 2 &&
      messages[0]?.role === "system" &&
      messages[1]?.role === "user"
        ? "system-user"
        : "chat"),
    messages,
    variablesSchema: z.toJSONSchema(evalJudgeVariablesSchema),
    configSchema: { type: "object", additionalProperties: false },
    config: {},
    dependencies: [],
  });
  validatePromptContent(content);
  const variables = promptVariables(content);
  for (const path of variables)
    if (!allowedPath(path))
      throw new PromptError(
        "PROMPT_VARIABLE_UNKNOWN",
        `Unknown judge input ${path}.`,
      );
  if (
    !variables.some(
      (path) => path === "criterion" || path === "criterion.text",
    ) ||
    !variables.some(
      (path) => path === "observation" || path.startsWith("observation."),
    )
  )
    throw new PromptError(
      "JUDGE_PROMPT_INPUT_MISSING",
      "Judge prompts must include the criterion text and current observation.",
    );
  return freeze(
    EvalJudgePromptSchema.parse({
      id: options.id,
      version: options.version ?? 1,
      hash: createHash("sha256")
        .update(canonicalPromptJson(content))
        .digest("hex"),
      content,
    }),
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Validate even deserialized definitions, including their immutable content hash. */
export function validateJudgePrompt(value: EvalJudgePrompt): EvalJudgePrompt {
  const rebuilt = defineJudgePrompt({
    id: value.id,
    version: value.version,
    format: value.content.format,
    messages: value.content.messages,
  });
  if (
    rebuilt.hash !== value.hash ||
    canonicalPromptJson(rebuilt.content) !== canonicalPromptJson(value.content)
  )
    throw new PromptError(
      "PROMPT_HASH_MISMATCH",
      `Judge prompt ${value.id} does not match its content hash or variable contract.`,
    );
  return rebuilt;
}

export function renderJudgePrompt(
  prompt: EvalJudgePrompt,
  input: EvalGradeInput,
): Message[] {
  const safe = validateJudgePrompt(prompt);
  const cleanObservation = (value: EvalGradeInput["observation"]) => {
    const { promptUsage: _usage, ...selected } = compactEvalObservation(value);
    return {
      ...selected,
      events: selected.events ?? [],
      interrupt: selected.interrupt ?? null,
    };
  };
  const variables = {
    criterion: input.criterion,
    input: input.input,
    observation: cleanObservation(input.observation),
    reference: input.reference ?? null,
    conversation: input.conversation.map((step) => ({
      input: step.input,
      observation: cleanObservation(step.observation),
    })),
  };
  const ref = definePrompt({
    id: safe.id,
    format: safe.content.format,
    variables: evalJudgeVariablesSchema,
    config: z.object({}),
  });
  return compilePrompt(ref, safe, evalJudgeVariablesSchema.parse(variables), {
    source: "eval",
    environment: "evaluation",
    snapshotRevision: safe.hash,
  }).messages;
}
