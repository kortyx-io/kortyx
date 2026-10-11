import { describe, expect, it } from "vitest";
import { requirePrincipalEnvironment } from "../src/middleware/security";

describe("credential environment binding", () => {
  const key = {
    kind: "api-key",
    keyId: "key",
    organizationId: "org",
    projectId: "project",
    mode: "test",
    scopes: ["telemetry:write"],
    environmentId: "env",
    environment: "development",
  } as const;
  it("allows the bound environment but rejects an entire mixed batch", () => {
    expect(() =>
      requirePrincipalEnvironment(key, ["development", "development"]),
    ).not.toThrow();
    expect(() =>
      requirePrincipalEnvironment(key, ["development", "production"]),
    ).toThrow("does not permit");
  });
  it("preserves existing unbound OSS operator keys", () => {
    const { environment, environmentId, ...operatorKey } = key;
    expect(() =>
      requirePrincipalEnvironment(operatorKey, ["production"]),
    ).not.toThrow();
  });
});
