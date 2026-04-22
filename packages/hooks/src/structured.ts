import { randomUUID } from "node:crypto";
import { getHookContext } from "./context";
import { assertStructuredPath } from "./structured-path";
import type { UseReasonStructuredConfig, UseStructuredDataArgs } from "./types";
import { parseWithSchema } from "./validation";

const createStructuredStreamId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

export const emitStructuredData = <TData = unknown>(
  args: UseStructuredDataArgs<TData>,
): void => {
  const ctx = getHookContext();
  const streamId =
    typeof args.streamId === "string" && args.streamId.length > 0
      ? args.streamId
      : createStructuredStreamId();
  const dataType =
    typeof args.dataType === "string" && args.dataType.length > 0
      ? args.dataType
      : "generic";

  const base = {
    node: ctx.node.graph.node,
    streamId,
    dataType,
    ...(typeof args.schemaId === "string" && args.schemaId.length > 0
      ? { schemaId: args.schemaId }
      : {}),
    ...(typeof args.schemaVersion === "string" && args.schemaVersion.length > 0
      ? { schemaVersion: args.schemaVersion }
      : {}),
    ...(typeof args.id === "string" && args.id.length > 0
      ? { id: args.id }
      : {}),
  };

  if (args.kind === "set") {
    assertStructuredPath(args.path, "useStructuredData");
    const value = parseWithSchema(
      args.valueSchema,
      args.value,
      "useStructuredData value",
    );
    ctx.node.emit("structured_data", {
      ...base,
      kind: "set",
      path: args.path,
      value,
    });
    return;
  }

  if (args.kind === "append") {
    assertStructuredPath(args.path, "useStructuredData");
    const items = args.items.map((item) =>
      parseWithSchema(args.itemSchema, item, "useStructuredData append item"),
    );
    ctx.node.emit("structured_data", {
      ...base,
      kind: "append",
      path: args.path,
      items,
    });
    return;
  }

  if (args.kind === "text-delta") {
    assertStructuredPath(args.path, "useStructuredData");
    ctx.node.emit("structured_data", {
      ...base,
      kind: "text-delta",
      path: args.path,
      delta: args.delta,
    });
    return;
  }

  const validated = parseWithSchema(
    args.dataSchema,
    args.data,
    "useStructuredData data",
  );

  ctx.node.emit("structured_data", {
    ...base,
    kind: "final",
    data: validated,
  });
};

export const shouldEmitStructured = (
  cfg: UseReasonStructuredConfig | undefined,
): boolean => Boolean(cfg) && (cfg?.stream ?? true);
