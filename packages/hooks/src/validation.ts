import { ValidationError } from "@kortyx/core/errors";
import type { SchemaLike } from "./types";

export const parseWithSchema = <T>(
  schema: SchemaLike<T> | undefined,
  value: unknown,
  label: string,
): T => {
  if (!schema) return value as T;

  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  const parsedError =
    "error" in parsed && parsed.error ? parsed.error : undefined;
  const reason =
    typeof parsedError?.message === "string" && parsedError.message.length > 0
      ? parsedError.message
      : "invalid payload";
  throw new ValidationError(
    label === "useReason output" ? "MODEL_OUTPUT_SCHEMA" : "SCHEMA_VALIDATION",
    `${label} validation failed: ${reason}`,
    parsedError,
  );
};
