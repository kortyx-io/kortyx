const constraints = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "not",
]);
const formats = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Adapt the wire schema only; useReason retains the original output validator. */
export function normalizeOutputSchema(schema: unknown): {
  schema: unknown;
  changed: boolean;
} {
  let changed = false;
  const visit = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    const result: Record<string, unknown> = {};
    const descriptions: string[] = [];
    for (const [key, entry] of Object.entries(value)) {
      if (
        constraints.has(key) ||
        (key === "format" && !formats.has(String(entry)))
      ) {
        descriptions.push(`${key}: ${JSON.stringify(entry)}`);
        changed = true;
      } else if (
        ["properties", "$defs", "definitions", "patternProperties"].includes(
          key,
        ) &&
        isRecord(entry)
      ) {
        result[key] = Object.fromEntries(
          Object.entries(entry).map(([name, definition]) => [
            name,
            visit(definition),
          ]),
        );
      } else if (
        ["anyOf", "oneOf", "allOf", "prefixItems"].includes(key) &&
        Array.isArray(entry)
      ) {
        result[key] = entry.map(visit);
      } else if (["items", "additionalProperties"].includes(key)) {
        result[key] = Array.isArray(entry) ? entry.map(visit) : visit(entry);
      } else {
        // Names inside properties and values inside enum/const are user data.
        result[key] = entry;
      }
    }
    if (descriptions.length) {
      result.description = [
        value.description,
        `Additional constraints: ${descriptions.join("; ")}`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (
      (value.type === "object" || value.properties) &&
      value.additionalProperties === undefined
    ) {
      result.additionalProperties = false;
      changed = true;
    }
    return result;
  };
  return { schema: visit(schema), changed };
}
