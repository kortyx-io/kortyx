// Browser-safe exports for client bundles.
// Keep this file free of Node-only imports (fs, path, etc).

export type { ConsumeStreamHandlers } from "./client/consume-stream";
export { consumeStream } from "./client/consume-stream";
export { readStream } from "./client/read-stream";
export type { StreamFromRouteArgs } from "./client/stream-from-route";
export { streamFromRoute } from "./client/stream-from-route";
export * from "./structured/apply-structured-chunk";
export * from "./structured/structured-stream-accumulator";
export type { StreamChunk } from "./types/stream-chunk";
export type { StructuredDataChunk } from "./types/structured-data";
