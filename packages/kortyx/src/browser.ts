// Browser-safe exports for client bundles (e.g. Next.js Client Components).
// Keep this file free of Node-only imports (fs, path, etc).

export type { StreamChatFromRouteArgs } from "@kortyx/agent/browser";
export { streamChatFromRoute } from "@kortyx/agent/browser";
export type { StreamChunk, StreamFromRouteArgs } from "@kortyx/stream/browser";
export { readStream, streamFromRoute } from "@kortyx/stream/browser";
