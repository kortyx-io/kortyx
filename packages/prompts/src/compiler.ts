import Ajv2020 from "ajv/dist/2020";
import type { z } from "zod";
import {
  canonicalPromptJson,
  type PromptContent,
  PromptError,
  type PromptVersion,
} from "./contracts";
import { expandPromptMessages } from "./references";

const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateFormats: false,
  ownProperties: true,
});
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
const compiledPrompts = new WeakSet<object>();
const usageMetadata = new WeakSet<object>();
export function isCompiledPrompt(value: unknown): value is CompiledPrompt {
  return Boolean(
    value && typeof value === "object" && compiledPrompts.has(value),
  );
}
export function promptUsageMetadata(
  prompt: CompiledPrompt,
): Record<string, unknown> {
  if (!isCompiledPrompt(prompt))
    throw new PromptError(
      "PROMPT_REASON_INVALID",
      "Use a compiled prompt returned by usePrompt.",
    );
  const metadata = Object.freeze({
    id: prompt.ref.id,
    version: prompt.ref.version,
    hash: prompt.ref.hash,
    environment: prompt.ref.environment,
    snapshotRevision: prompt.ref.snapshotRevision,
    ...(prompt.dependencies?.length
      ? { dependencies: prompt.dependencies }
      : {}),
  });
  usageMetadata.add(metadata);
  return metadata;
}
export function isPromptUsageMetadata(value: unknown): value is {
  id: string;
  version: number;
  hash: string;
  environment: string;
  snapshotRevision: string;
  dependencies?: { id: string; version: number; hash: string }[];
} {
  return Boolean(
    value && typeof value === "object" && usageMetadata.has(value),
  );
}
function freezeValue<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const item of Object.values(value)) freezeValue(item, seen);
    Object.freeze(value);
  }
  return value;
}
export function validatePromptValue(
  schema: Record<string, unknown>,
  value: unknown,
  label: string,
): void {
  const key = canonicalPromptJson(schema);
  let validator = validators.get(key);
  if (!validator) {
    if (validators.size >= 256) validators.clear();
    try {
      validator = ajv.compile(schema);
    } catch {
      throw new PromptError(
        "PROMPT_SCHEMA_INVALID",
        `${label} schema is invalid.`,
      );
    }
    validators.set(key, validator);
  }
  if (!validator(value))
    throw new PromptError(
      "PROMPT_CONTRACT_MISMATCH",
      `${label}: ${ajv.errorsText(validator.errors)}.`,
    );
}
const placeholder = /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;
export function promptVariables(content: PromptContent): string[] {
  return [
    ...new Set(
      content.messages.flatMap((message) =>
        [...message.content.matchAll(placeholder)].map(
          (match) => match[1] as string,
        ),
      ),
    ),
  ];
}
export function validatePromptContent(content: PromptContent): void {
  validatePromptValue(content.configSchema, content.config, "Configuration");
  // Compile both contracts before storing an executable version.
  try {
    ajv.compile(content.variablesSchema);
  } catch {
    throw new PromptError(
      "PROMPT_SCHEMA_INVALID",
      "Template input schema is invalid.",
    );
  }
  const inputs = content.variablesSchema.properties as
    | Record<string, unknown>
    | undefined;
  for (const variable of promptVariables(content)) {
    const top = variable.split(".")[0] as string;
    if (!inputs || !Object.hasOwn(inputs, top))
      throw new PromptError(
        "PROMPT_VARIABLE_UNKNOWN",
        `Declare template input ${top} in the input schema.`,
      );
    if (Object.hasOwn(content.config, top))
      throw new PromptError(
        "PROMPT_VARIABLE_CONFIG_OVERLAP",
        `${top} cannot be both a template input and saved configuration.`,
      );
  }
}
export type PromptRef<
  Inputs = unknown,
  Config = unknown,
  Format extends "system-user" | "chat" = "system-user" | "chat",
> = Readonly<{
  id: string;
  format: Format;
  variables: z.ZodType<Inputs>;
  config: z.ZodType<Config>;
}>;
export function definePrompt<
  Inputs,
  Config,
  Format extends "system-user" | "chat",
>(
  reference: PromptRef<Inputs, Config, Format>,
): PromptRef<Inputs, Config, Format> {
  if (!reference.id || !reference.variables || !reference.config)
    throw new PromptError(
      "PROMPT_REFERENCE_INVALID",
      "A prompt reference needs id, variables and config schemas.",
    );
  return Object.freeze({ ...reference });
}
export type CompiledPrompt<Config = unknown> = Readonly<{
  format: "system-user" | "chat";
  system?: string | undefined;
  user?: string | undefined;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  config: Config;
  dependencies?: { id: string; version: number; hash: string }[];
  ref: {
    id: string;
    version: number;
    hash: string;
    source: string;
    environment: string;
    snapshotRevision: string;
  };
}>;
export function compilePrompt<Inputs, Config>(
  ref: PromptRef<Inputs, Config>,
  version: PromptVersion,
  variables: Inputs,
  identity: { source: string; environment: string; snapshotRevision: string },
  versions?: Readonly<Record<string, PromptVersion>>,
): CompiledPrompt<Config> {
  if (version.id !== ref.id || version.content.format !== ref.format)
    throw new PromptError(
      "PROMPT_CONTRACT_MISMATCH",
      `Prompt ${ref.id} format or identity differs from the application contract.`,
    );
  const values = ref.variables.parse(variables);
  validatePromptValue(
    version.content.variablesSchema,
    values,
    "Template inputs",
  );
  validatePromptValue(
    version.content.configSchema,
    version.content.config,
    "Configuration",
  );
  const config = ref.config.parse(structuredClone(version.content.config));
  const expanded = expandPromptMessages(version, versions);
  if (expanded.used.length)
    validatePromptContent({ ...version.content, messages: expanded.messages });
  for (const child of expanded.used) {
    const properties = child.content.variablesSchema.properties;
    const childValues =
      properties && typeof properties === "object" && !Array.isArray(properties)
        ? Object.fromEntries(
            Object.keys(properties)
              .filter((key) => Object.hasOwn(values as object, key))
              .map((key) => [key, (values as Record<string, unknown>)[key]]),
          )
        : values;
    validatePromptValue(
      child.content.variablesSchema,
      childValues,
      `Inputs for ${child.id}`,
    );
  }
  const messages = expanded.messages.map((message) => ({
    role: message.role,
    content: message.content.replace(placeholder, (_, path: string) => {
      let value: unknown = values;
      for (const key of path.split(".")) {
        if (
          ["__proto__", "constructor", "prototype"].includes(key) ||
          !value ||
          typeof value !== "object" ||
          !Object.hasOwn(value, key)
        )
          throw new PromptError(
            "PROMPT_VARIABLE_MISSING",
            `Missing template input ${path}.`,
          );
        value = (value as Record<string, unknown>)[key];
      }
      if (value === undefined)
        throw new PromptError(
          "PROMPT_VARIABLE_MISSING",
          `Missing template input ${path}.`,
        );
      return typeof value === "string" ? value : canonicalPromptJson(value);
    }),
  }));
  const compiled = freezeValue({
    format: ref.format,
    messages,
    config,
    ...(expanded.used.length
      ? {
          dependencies: expanded.used.map(({ id, version, hash }) => ({
            id,
            version,
            hash,
          })),
        }
      : {}),
    ...(ref.format === "system-user"
      ? { system: messages[0]?.content, user: messages[1]?.content }
      : {}),
    ref: {
      id: ref.id,
      version: version.version,
      hash: version.hash,
      ...identity,
    },
  });
  compiledPrompts.add(compiled);
  return compiled;
}
