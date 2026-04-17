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

const cloneContainer = (value: unknown): unknown => {
  if (Array.isArray(value)) return [...value];
  if (isPlainObject(value)) return { ...value };
  return {};
};

const isArrayIndex = (value: string): boolean => /^\d+$/.test(value);

const setByParts = (
  input: unknown,
  parts: string[],
  value: unknown,
): unknown => {
  if (parts.length === 0) return value;

  const [part, ...rest] = parts;
  if (part === undefined) return value;

  if (Array.isArray(input) || isArrayIndex(part)) {
    const nextArray = Array.isArray(input) ? [...input] : [];
    const index = Number(part);
    if (!Number.isInteger(index)) return nextArray;
    nextArray[index] = setByParts(nextArray[index], rest, value);
    return nextArray;
  }

  const nextObject = isPlainObject(input) ? { ...input } : {};
  nextObject[part] = setByParts(nextObject[part], rest, value);
  return nextObject;
};

const getByPath = (input: unknown, path: string): unknown => {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = input;

  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }

    if (isPlainObject(current)) {
      current = current[part];
      continue;
    }

    return undefined;
  }

  return current;
};

const setByPath = (input: unknown, path: string, value: unknown): unknown => {
  const parts = path.split(".").filter(Boolean);
  return parts.length === 0
    ? value
    : setByParts(cloneContainer(input), parts, value);
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

  const previousData =
    current?.data !== undefined
      ? current.data
      : ({} as TData | Record<string, unknown>);

  if (chunk.kind === "set") {
    return {
      ...nextBase,
      data: setByPath(previousData, chunk.path, chunk.value) as TData,
    };
  }

  if (chunk.kind === "append") {
    const existing = getByPath(previousData, chunk.path);
    const nextItems = Array.isArray(existing)
      ? [...existing, ...chunk.items]
      : [...chunk.items];
    return {
      ...nextBase,
      data: setByPath(previousData, chunk.path, nextItems) as TData,
    };
  }

  const existing = getByPath(previousData, chunk.path);
  const text = typeof existing === "string" ? existing : "";
  return {
    ...nextBase,
    data: setByPath(previousData, chunk.path, text + chunk.delta) as TData,
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
