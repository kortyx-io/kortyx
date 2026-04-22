import type { StructuredDataChunk } from "../types/structured-data";

export type StructuredStreamState<TData = unknown> = {
  streamId: string;
  dataType: string;
  status: "streaming" | "done";
  data: TData;
  node?: string;
  id?: string;
  schemaId?: string;
  schemaVersion?: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isArrayIndex = (value: string): boolean => /^\d+$/.test(value);

const describeValue = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const parsePath = (path: string): string[] => {
  if (path.length === 0) {
    throw new Error(
      "Structured chunk path must be a non-empty dot-separated string.",
    );
  }

  const parts = path.split(".");
  if (parts.some((part) => part.length === 0)) {
    throw new Error(
      `Structured chunk path "${path}" must not contain empty segments.`,
    );
  }

  return parts;
};

const cloneContainerForPart = (args: {
  current: unknown;
  part: string;
  path: string;
  traversed: string[];
}): Record<string, unknown> | unknown[] => {
  const expected = isArrayIndex(args.part) ? "array" : "object";
  const location =
    args.traversed.length === 0 ? "<root>" : args.traversed.join(".");

  if (args.current === undefined) {
    return expected === "array" ? [] : {};
  }

  if (expected === "array") {
    if (Array.isArray(args.current)) return [...args.current];
    throw new Error(
      `Structured path conflict at ${location} for "${args.path}": expected array container, received ${describeValue(args.current)}.`,
    );
  }

  if (isPlainObject(args.current)) return { ...args.current };

  throw new Error(
    `Structured path conflict at ${location} for "${args.path}": expected object container, received ${describeValue(args.current)}.`,
  );
};

const updateByParts = (args: {
  input: unknown;
  parts: string[];
  path: string;
  updateLeaf: (current: unknown) => unknown;
  traversed?: string[];
}): unknown => {
  const traversed = args.traversed ?? [];
  const [part, ...rest] = args.parts;
  if (part === undefined) {
    return args.updateLeaf(args.input);
  }

  const container = cloneContainerForPart({
    current: args.input,
    part,
    path: args.path,
    traversed,
  });

  const currentChild = Array.isArray(container)
    ? container[Number(part)]
    : container[part];
  const nextChild =
    rest.length === 0
      ? args.updateLeaf(currentChild)
      : updateByParts({
          input: currentChild,
          parts: rest,
          path: args.path,
          updateLeaf: args.updateLeaf,
          traversed: [...traversed, part],
        });

  if (Array.isArray(container)) {
    container[Number(part)] = nextChild;
  } else {
    container[part] = nextChild;
  }

  return container;
};

export function applyStructuredChunk<TData = unknown>(
  current: StructuredStreamState<TData> | undefined,
  chunk: StructuredDataChunk,
): StructuredStreamState<TData> {
  if (current && current.streamId !== chunk.streamId) {
    throw new Error(
      `Structured chunk streamId mismatch: expected ${current.streamId}, received ${chunk.streamId}.`,
    );
  }

  if (current?.status === "done") {
    throw new Error(
      `Structured stream ${chunk.streamId} already completed with a final chunk.`,
    );
  }

  const nextBase = {
    streamId: chunk.streamId,
    dataType: chunk.dataType,
    status: chunk.kind === "final" ? ("done" as const) : ("streaming" as const),
    ...(chunk.node ? { node: chunk.node } : {}),
    ...(chunk.id ? { id: chunk.id } : {}),
    ...(chunk.schemaId ? { schemaId: chunk.schemaId } : {}),
    ...(chunk.schemaVersion ? { schemaVersion: chunk.schemaVersion } : {}),
  };

  if (chunk.kind === "final") {
    return {
      ...nextBase,
      data: chunk.data as TData,
    };
  }

  const path = chunk.path;
  const pathParts = parsePath(path);
  const previousData = current?.data;

  if (chunk.kind === "set") {
    return {
      ...nextBase,
      data: updateByParts({
        input: previousData,
        parts: pathParts,
        path,
        updateLeaf: () => chunk.value,
      }) as TData,
    };
  }

  if (chunk.kind === "append") {
    return {
      ...nextBase,
      data: updateByParts({
        input: previousData,
        parts: pathParts,
        path,
        updateLeaf: (existing) => {
          if (existing === undefined) return [...chunk.items];
          if (!Array.isArray(existing)) {
            throw new Error(
              `Structured append requires path "${path}" to target an array, received ${describeValue(existing)}.`,
            );
          }
          return [...existing, ...chunk.items];
        },
      }) as TData,
    };
  }

  return {
    ...nextBase,
    data: updateByParts({
      input: previousData,
      parts: pathParts,
      path,
      updateLeaf: (existing) => {
        if (existing === undefined) return chunk.delta;
        if (typeof existing !== "string") {
          throw new Error(
            `Structured text-delta requires path "${path}" to target a string, received ${describeValue(existing)}.`,
          );
        }
        return existing + chunk.delta;
      },
    }) as TData,
  };
}

export function reduceStructuredChunks<TData = unknown>(
  chunks: StructuredDataChunk[],
): Record<string, StructuredStreamState<TData>> {
  return chunks.reduce<Record<string, StructuredStreamState<TData>>>(
    (acc, chunk) => {
      acc[chunk.streamId] = applyStructuredChunk(acc[chunk.streamId], chunk);
      return acc;
    },
    {},
  );
}
