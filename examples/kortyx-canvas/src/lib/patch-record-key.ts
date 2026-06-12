import type { DiscoveryCanvasOp } from "@/schemas/canvas-ops";

/**
 * Turn a canvas dot-path into a single safe record key for structured
 * streaming. Dots become `__` so path segments are not parsed as nested
 * keys, and we never emit pure-numeric segments (which would create arrays).
 */
export function toPatchRecordKey(path: string): string {
  return path.replace(/\./g, "__");
}

/** Stable record key for a structural canvas op in streamed payloads. */
export function toStructuralPatchRecordKey(op: DiscoveryCanvasOp): string {
  switch (op.op) {
    case "set":
      return toPatchRecordKey(op.path);
    case "addSection":
      return `addSection__${op.sectionKey}`;
    case "removeSection":
      return `removeSection__${op.sectionKey}`;
    case "addItem":
      return `addItem__${op.sectionKey}__${op.itemKey}`;
    case "removeItem":
      return `removeItem__${op.sectionKey}__${op.itemKey}`;
  }
}

/** Build the `structured.fields` map for progressive set-op streaming. */
export function buildLlmPatchStreamFields(
  paths: string[],
): Record<string, "set" | "text-delta"> {
  const fields: Record<string, "set" | "text-delta"> = {};
  for (const path of paths) {
    const key = toPatchRecordKey(path);
    fields[`patches.${key}`] = "set";
    fields[`patches.${key}.value`] = "text-delta";
  }
  return fields;
}

export function patchesRecordFromOps(
  ops: DiscoveryCanvasOp[],
): Record<string, DiscoveryCanvasOp> {
  return Object.fromEntries(
    ops.map((op) => [toStructuralPatchRecordKey(op), op]),
  );
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Read patch entries from either record or legacy ordered payloads. */
export function listPatchPayloadEntries(
  raw: unknown,
): Array<{ key: string; entry: Record<string, unknown> }> {
  if (!isPlainObject(raw)) return [];
  const patches = raw.patches;
  if (Array.isArray(patches)) {
    return patches.flatMap((entry, index) =>
      isPlainObject(entry) ? [{ key: String(index), entry }] : [],
    );
  }
  if (!isPlainObject(patches)) return [];
  return Object.entries(patches).flatMap(([key, entry]) =>
    isPlainObject(entry) ? [{ key, entry }] : [],
  );
}
