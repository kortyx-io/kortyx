import { emitStructuredData } from "../structured";
import type { UseReasonStructuredConfig } from "../types";
import {
  extractCompletedArrayItemGroups,
  extractCompletedFieldValues,
  extractStreamingStringValues,
  resolveAppendFieldPaths,
  resolveSetFieldPaths,
  resolveTextDeltaFieldPaths,
} from "./structured-stream";

export function createStructuredOutputStreamer(
  args: { structured?: UseReasonStructuredConfig | undefined },
  id: string | undefined,
  opId: string,
) {
  let firstText = "";
  const setFieldPaths = resolveSetFieldPaths(args.structured);
  const appendFieldPaths = resolveAppendFieldPaths(args.structured);
  const textDeltaFieldPaths = resolveTextDeltaFieldPaths(args.structured);
  const emittedSetValues = new Map<string, string>();
  const emittedAppendCounts = new Map<string, number>();
  const emittedTextValues = new Map<string, string>();
  return (delta: string) => {
    firstText += delta;

    for (const fieldPath of setFieldPaths) {
      const values = extractCompletedFieldValues({
        text: firstText,
        path: fieldPath,
      });

      for (const { path, value } of values) {
        const nextSerialized = JSON.stringify(value);
        if (emittedSetValues.get(path) === nextSerialized) continue;

        emittedSetValues.set(path, nextSerialized);
        emitStructuredData({
          kind: "set",
          path,
          value,
          dataType: args.structured?.dataType ?? "reason-output",
          ...(args.structured?.schemaId
            ? { schemaId: args.structured.schemaId }
            : {}),
          ...(args.structured?.schemaVersion
            ? { schemaVersion: args.structured.schemaVersion }
            : {}),
          ...(id ? { id } : {}),
          streamId: opId,
        });
      }
    }

    for (const fieldPath of appendFieldPaths) {
      const groups = extractCompletedArrayItemGroups({
        text: firstText,
        path: fieldPath,
      });

      for (const { path, items } of groups) {
        const emittedAppendCount = emittedAppendCounts.get(path) ?? 0;
        if (items.length <= emittedAppendCount) continue;

        const nextItems = items.slice(emittedAppendCount);
        emittedAppendCounts.set(path, items.length);
        emitStructuredData({
          kind: "append",
          path,
          items: nextItems,
          dataType: args.structured?.dataType ?? "reason-output",
          ...(args.structured?.schemaId
            ? { schemaId: args.structured.schemaId }
            : {}),
          ...(args.structured?.schemaVersion
            ? { schemaVersion: args.structured.schemaVersion }
            : {}),
          ...(id ? { id } : {}),
          streamId: opId,
        });
      }
    }

    for (const fieldPath of textDeltaFieldPaths) {
      const values = extractStreamingStringValues({
        text: firstText,
        path: fieldPath,
      });

      for (const { path, value } of values) {
        const emittedTextValue = emittedTextValues.get(path) ?? "";
        if (
          value.length <= emittedTextValue.length ||
          !value.startsWith(emittedTextValue)
        ) {
          continue;
        }

        const nextDelta = value.slice(emittedTextValue.length);
        emittedTextValues.set(path, value);
        if (nextDelta.length === 0) continue;

        emitStructuredData({
          kind: "text-delta",
          path,
          delta: nextDelta,
          dataType: args.structured?.dataType ?? "reason-output",
          ...(args.structured?.schemaId
            ? { schemaId: args.structured.schemaId }
            : {}),
          ...(args.structured?.schemaVersion
            ? { schemaVersion: args.structured.schemaVersion }
            : {}),
          ...(id ? { id } : {}),
          streamId: opId,
        });
      }
    }
  };
}
