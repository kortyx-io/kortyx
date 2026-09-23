export * from "@kortyx/core/errors";
// Browser-safe exports for client bundles (e.g. Next.js Client Components).
// Keep this file free of Node-only imports (fs, path, etc).

export type { StreamChatFromRouteArgs } from "@kortyx/agent/browser";
export { streamChatFromRoute } from "@kortyx/agent/browser";
export type {
  ConsumeStreamHandlers,
  FinalizedChatContentPiece,
  FinalizedChatMessage,
  StreamChunk,
  StreamFromRouteArgs,
  StructuredDataChunk,
  StructuredStreamAccumulator,
  StructuredStreamState,
} from "@kortyx/stream/browser";
export {
  applyStructuredChunk,
  consumeStream,
  createFinalizedChatMessageAccumulator,
  createStructuredStreamAccumulator,
  projectInterruptPiece,
  readStream,
  reduceStructuredChunks,
  streamFromRoute,
} from "@kortyx/stream/browser";
