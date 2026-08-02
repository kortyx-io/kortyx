import { describe, expect, it } from "vitest";
import {
  hashTelemetryApiKeySecret,
  parseTelemetryApiKey,
} from "../src/repositories/api-keys";

describe("telemetry API keys", () => {
  it("parses Kortyx telemetry API keys", () => {
    expect(parseTelemetryApiKey("ktyx_test_key123_secret456")).toEqual({
      mode: "test",
      keyId: "key123",
      secret: "secret456",
    });
    expect(parseTelemetryApiKey("ktyx_live_key123_secret456")).toEqual({
      mode: "live",
      keyId: "key123",
      secret: "secret456",
    });
  });

  it("rejects invalid key formats", () => {
    expect(parseTelemetryApiKey("")).toBeUndefined();
    expect(parseTelemetryApiKey("ktyx_dev_key_secret")).toBeUndefined();
    expect(parseTelemetryApiKey("ktyx_test_missingsecret")).toBeUndefined();
  });

  it("hashes API-key secrets with a server pepper", () => {
    const first = hashTelemetryApiKeySecret("secret", "pepper-a");
    const second = hashTelemetryApiKeySecret("secret", "pepper-b");

    expect(first).toHaveLength(64);
    expect(first).not.toBe(second);
  });
});
