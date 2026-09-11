import "server-only";
import {
  createKortyxTelemetryAdapter,
  type KortyxTelemetryAdapter,
} from "@kortyx/telemetry";

declare global {
  var __kortyxChatTelemetry: KortyxTelemetryAdapter | undefined;
}
const endpoint =
  process.env.KORTYX_TELEMETRY_API_URL ?? process.env.KORTYX_API_URL;
const apiKey = process.env.KORTYX_TELEMETRY_API_KEY;
if (endpoint && apiKey) {
  globalThis.__kortyxChatTelemetry ??= createKortyxTelemetryAdapter({
    endpoint,
    apiKey,
    environment: process.env.KORTYX_TELEMETRY_ENVIRONMENT ?? "development",
    service: { name: "kortyx-nextjs-chat-example" },
    captureContent: process.env.KORTYX_TELEMETRY_CAPTURE_CONTENT === "true",
  });
}
export const telemetry = globalThis.__kortyxChatTelemetry;
