/** Strip credential-shaped fields before metadata reaches any adapter/exporter. */
const privateField =
  /^(?:password|passwd|secret|clientsecret|privatekey|credential|credentials|authorization|bearer|bearertoken|jwt|token|accesstoken|refreshtoken|authtoken|apikey|apisecret|cookie|setcookie|resumehandle|resumetoken)$/;
export function safeTelemetryMetadata(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const seen = new WeakSet<object>();
  const visit = (input: unknown, depth: number): unknown => {
    if (depth > 8 || typeof input === "function" || typeof input === "symbol")
      return undefined;
    if (!input || typeof input !== "object") return input;
    if (seen.has(input)) return undefined;
    seen.add(input);
    if (Array.isArray(input))
      return input.map((item) => visit(item, depth + 1));
    return Object.fromEntries(
      Object.entries(input).flatMap(([key, nested]) =>
        privateField.test(key.toLowerCase().replace(/[^a-z0-9]/g, ""))
          ? []
          : [[key, visit(nested, depth + 1)]],
      ),
    );
  };
  try {
    return visit(value, 0) as Record<string, unknown>;
  } catch {
    return {};
  }
}
