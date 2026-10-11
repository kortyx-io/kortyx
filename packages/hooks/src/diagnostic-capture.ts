import { errorProperty } from "@kortyx/core/errors";
import {
  DIAGNOSTIC_LIMITS,
  type DiagnosticContent,
  type DiagnosticNote,
  isPrivateDiagnosticField,
  redactDiagnosticText,
} from "@kortyx/telemetry-contracts";
import type { KortyxTraceErrorProjection } from "./tracing";

const encoder = new TextEncoder();
// Node 24 stores even assigned stacks behind a shared native lazy accessor.
const nativeStackGetter = Object.getOwnPropertyDescriptor(
  new Error(),
  "stack",
)?.get;
function nativeStack(
  object: object,
  getter: (() => unknown) | undefined,
): unknown {
  if (!getter || getter !== nativeStackGetter)
    throw new Error("Custom stack accessor");
  for (const key of ["name", "message"]) {
    let cursor: object | null = object;
    while (cursor) {
      const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
      if (descriptor) {
        if (!("value" in descriptor) || typeof descriptor.value !== "string")
          throw new Error("Custom error formatting");
        break;
      }
      cursor = Object.getPrototypeOf(cursor);
    }
  }
  const formatter = Object.getOwnPropertyDescriptor(Error, "prepareStackTrace");
  if (formatter && (!("value" in formatter) || !formatter.writable))
    throw new Error("Custom stack formatter");
  // Synchronous formatting must not invoke an application's prepareStackTrace.
  Object.defineProperty(Error, "prepareStackTrace", {
    ...(formatter ?? { configurable: true, writable: true }),
    value: undefined,
  });
  try {
    return getter.call(object);
  } finally {
    if (formatter) Object.defineProperty(Error, "prepareStackTrace", formatter);
    else Reflect.deleteProperty(Error, "prepareStackTrace");
  }
}
const pointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

/** Data-only graph capture. Getters and application toJSON methods are never invoked. */
export function captureDiagnosticContent(
  error: unknown,
  project?: KortyxTraceErrorProjection,
): DiagnosticContent | null {
  const omissions: DiagnosticNote[] = [];
  const redactions: DiagnosticNote[] = [];
  const seen = new WeakMap<object, string>();
  let nodes = 0;
  let remaining = DIAGNOSTIC_LIMITS.bytes - 64 * 1024;
  const omit = (
    path: string,
    reason: string,
    extra: Partial<DiagnosticNote> = {},
  ) => {
    if (omissions.length < 1000)
      omissions.push({ path: path.slice(0, 4096), reason, ...extra });
    return { $omitted: reason };
  };
  const visit = (value: unknown, path: string, depth: number): unknown => {
    if (++nodes > DIAGNOSTIC_LIMITS.nodes) return omit(path, "node_limit");
    if (depth > DIAGNOSTIC_LIMITS.depth) return omit(path, "depth_limit");
    if (typeof value === "string") {
      const clean = redactDiagnosticText(value);
      if (clean !== value && redactions.length < 1000)
        redactions.push({
          path: path.slice(0, 4096),
          reason: "credential_text",
        });
      const bytes = encoder.encode(JSON.stringify(clean)).length;
      if (bytes > remaining)
        return omit(path, "byte_limit", {
          originalBytes: encoder.encode(value).length,
        });
      remaining -= bytes;
      return clean;
    }
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number")
      return Number.isFinite(value)
        ? value
        : { $type: "number", value: String(value) };
    if (typeof value === "bigint")
      return { $type: "bigint", value: value.toString() };
    if (typeof value === "undefined") return { $type: "undefined" };
    if (typeof value === "function" || typeof value === "symbol")
      return omit(path, `unsupported_${typeof value}`);
    const object = value as object;
    const reference = seen.get(object);
    if (reference) return { $ref: reference };
    seen.set(object, path);
    remaining -= 32;
    if (remaining < 0) return omit(path, "byte_limit");
    try {
      if (value instanceof Date)
        return { $type: "Date", value: Date.prototype.toISOString.call(value) };
      if (value instanceof Map || value instanceof Set) {
        const isMap = value instanceof Map;
        const iterator = isMap
          ? Map.prototype.entries.call(value)
          : Set.prototype.values.call(value);
        const count = Object.getOwnPropertyDescriptor(
          isMap ? Map.prototype : Set.prototype,
          "size",
        )?.get?.call(value) as number;
        const entries: unknown[] = [];
        for (
          let index = 0;
          index < Math.min(count, DIAGNOSTIC_LIMITS.properties);
          index++
        )
          entries.push(iterator.next().value);
        if (count > entries.length)
          omissions.push({
            path,
            reason: "collection_limit",
            originalCount: count,
          });
        return isMap
          ? {
              $type: "Map",
              entries: visit(entries, `${path}/entries`, depth + 1),
            }
          : {
              $type: "Set",
              values: visit(entries, `${path}/values`, depth + 1),
            };
      }
      if (Array.isArray(value)) {
        const count = Math.min(value.length, DIAGNOSTIC_LIMITS.properties);
        const items = Array.from({ length: count }, (_, index) =>
          read(value, String(index), `${path}/${index}`, depth),
        );
        if (count < value.length)
          items.push(
            omit(path, "collection_limit", { originalCount: value.length }),
          );
        return items;
      }
      const keys = Object.getOwnPropertyNames(object);
      const result: Record<string, unknown> = Object.create(null);
      if (value instanceof Error) {
        const ownName = Object.getOwnPropertyDescriptor(object, "name");
        let type: unknown =
          ownName && "value" in ownName ? ownName.value : undefined;
        if (typeof type !== "string") {
          const name = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(value),
            "name",
          );
          type = name && "value" in name ? name.value : "Error";
        }
        result.type = visit(
          typeof type === "string" ? type : "Error",
          `${path}/type`,
          depth + 1,
        );
      }
      for (const key of keys.slice(0, DIAGNOSTIC_LIMITS.properties)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) {
          result[key] = omit(`${path}/${pointer(key)}`, "unsafe_key");
          continue;
        }
        remaining -= encoder.encode(key).length + 4;
        result[key] = read(object, key, `${path}/${pointer(key)}`, depth);
      }
      if (keys.length > DIAGNOSTIC_LIMITS.properties)
        result.$omittedProperties = omit(path, "property_limit", {
          originalCount: keys.length,
        });
      return result;
    } catch {
      return omit(path, "unreadable_object");
    }
  };
  const read = (
    object: object,
    key: string,
    path: string,
    depth: number,
  ): unknown => {
    if (isPrivateDiagnosticField(key)) {
      if (redactions.length < 1000)
        redactions.push({
          path: path.slice(0, 4096),
          reason: "credential_field",
        });
      return "[REDACTED]";
    }
    try {
      const property = Object.getOwnPropertyDescriptor(object, key);
      if (property && "value" in property)
        return visit(property.value, path, depth + 1);
      if (
        key === "stack" &&
        object instanceof Error &&
        property?.get &&
        property.get === nativeStackGetter
      )
        return visit(nativeStack(object, property.get), path, depth + 1);
      return omit(
        path,
        property ? "accessor_not_evaluated" : "unavailable_property",
      );
    } catch {
      return omit(path, "unreadable_property");
    }
  };
  try {
    const original = project ? project(error) : error;
    if (project && original === null) return null;
    const captured = visit(original, "#/data", 0);
    const upstreamOmissions = errorProperty(original, "diagnosticOmissions");
    if (Array.isArray(upstreamOmissions))
      for (const note of upstreamOmissions.slice(0, 1000)) {
        const path = errorProperty(note, "path");
        const reason = errorProperty(note, "reason");
        if (typeof path === "string" && typeof reason === "string")
          omissions.push({
            path: redactDiagnosticText(path).slice(0, 4096),
            reason: redactDiagnosticText(reason).slice(0, 128),
          });
      }
    const data: Record<string, unknown> =
      captured && typeof captured === "object" && !Array.isArray(captured)
        ? (captured as Record<string, unknown>)
        : {
            type: "Error",
            message:
              typeof captured === "string"
                ? captured
                : "Execution reported a fault.",
            value: captured,
          };
    if (typeof data.message !== "string" && !("message" in data))
      data.message = "Execution reported a fault.";
    if (!("type" in data))
      data.type = typeof data.name === "string" ? data.name : "Error";
    const content: DiagnosticContent = {
      schemaVersion: 1,
      data,
      capture: {
        status: omissions.length ? "partial" : "complete",
        omissions,
        redactions,
      },
    };
    if (
      encoder.encode(JSON.stringify(content)).length > DIAGNOSTIC_LIMITS.bytes
    )
      return {
        schemaVersion: 1,
        data: {
          type: "Error",
          message: "Diagnostic exceeded the capture budget.",
        },
        capture: {
          status: "partial",
          redactions: [],
          omissions: [{ path: "#/data", reason: "serialized_byte_limit" }],
        },
      };
    return content;
  } catch {
    return {
      schemaVersion: 1,
      data: { type: "Error", message: "Diagnostic capture failed." },
      capture: {
        status: "failed",
        redactions: [],
        omissions: [{ path: "#/data", reason: "projection_or_capture_failed" }],
      },
    };
  }
}
