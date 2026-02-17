// Browser-safe exports for client bundles.
// Keep this file free of Node-only imports (fs, path, etc).

export type { StreamChatFromRouteArgs } from "./adapters/http-client";
export { streamChatFromRoute } from "./adapters/http-client";
