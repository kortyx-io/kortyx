import type { KortyxResponseFormat, KortyxWarning } from "@kortyx/providers";
import { toJSONSchema } from "zod";
import type { SchemaLike } from "../types";

/** Infer the wire schema only when the caller did not choose a format. */
export function inferOutputFormat(
  schema: SchemaLike<unknown> | undefined,
  explicit: KortyxResponseFormat | undefined,
): {
  responseFormat?: KortyxResponseFormat;
  warnings?: KortyxWarning[];
} {
  if (explicit) return { responseFormat: explicit };
  if (!schema) return {};
  try {
    const json = toJSONSchema(schema as never) as Record<string, unknown>;
    const clean = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(clean);
      if (!value || typeof value !== "object") return value;
      const object = value as Record<string, unknown>;
      if (
        [
          "allOf",
          "not",
          "dependentRequired",
          "dependentSchemas",
          "if",
          "then",
          "else",
          "prefixItems",
        ].some((key) => key in object)
      )
        throw new Error(
          "Schema composition requires an explicit provider schema",
        );
      if (object.type === "object") {
        if (object.additionalProperties !== false)
          throw new Error(
            "Dynamic properties require an explicit provider schema",
          );
        const properties = object.properties as
          | Record<string, unknown>
          | undefined;
        const required = object.required as string[] | undefined;
        if (
          properties &&
          Object.keys(properties).some((key) => !required?.includes(key))
        ) {
          throw new Error(
            "Optional properties require an explicit provider schema",
          );
        }
      }
      return Object.fromEntries(
        Object.entries(object)
          .filter(([key]) => key !== "$schema" && key !== "default")
          .map(([key, child]) => {
            // Property and definition names are user data, not schema keywords.
            if (
              (key === "properties" ||
                key === "$defs" ||
                key === "definitions") &&
              child &&
              typeof child === "object"
            )
              return [
                key,
                Object.fromEntries(
                  Object.entries(child).map(([name, definition]) => [
                    name,
                    clean(definition),
                  ]),
                ),
              ];
            return [
              key,
              key === "enum" || key === "const" ? child : clean(child),
            ];
          }),
      );
    };
    if (json.type !== "object")
      throw new Error("The provider schema must have an object root");
    return { responseFormat: { type: "json", schema: clean(json) } };
  } catch {
    return {
      responseFormat: { type: "json" },
      warnings: [
        {
          type: "compatibility",
          feature: "outputSchema",
          details:
            "This validator cannot be inferred as a strict provider JSON schema. Kortyx still validates the final output locally. Supply responseFormat.schema to enforce a wire schema.",
        },
      ],
    };
  }
}
