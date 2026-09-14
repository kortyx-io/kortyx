import {
  errorFromFailure,
  type FailureDescriptor,
  isFailureDescriptor,
  serializeFailure,
} from "@kortyx/core/errors";

export function failureChunk(error: unknown): {
  type: "error";
  message: string;
  failure: FailureDescriptor;
} {
  const failure = serializeFailure(error);
  return { type: "error", message: failure.message, failure };
}

export function streamError(chunk: {
  message: string;
  failure?: unknown;
}): Error {
  return isFailureDescriptor(chunk.failure)
    ? errorFromFailure(chunk.failure)
    : new Error(chunk.message || "Stream error.");
}
