import type { PromptCategory } from "@kortyx/telemetry-contracts";
export function categoryPath(
  categories: PromptCategory[],
  id: string | null,
): string {
  const segments: string[] = [],
    visited = new Set<string>();
  while (id && !visited.has(id)) {
    visited.add(id);
    const row = categories.find((item) => item.id === id);
    if (!row) break;
    segments.unshift(row.name);
    id = row.parentId;
  }
  return segments.join(" / ") || "Root";
}
export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
export const initialPrompt = {
  format: "system-user" as const,
  messages: [
    { role: "system" as const, content: "" },
    { role: "user" as const, content: "{{message}}" },
  ],
  variablesSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
    additionalProperties: false,
  },
  configSchema: { type: "object", additionalProperties: true },
  config: {},
  dependencies: [],
};
