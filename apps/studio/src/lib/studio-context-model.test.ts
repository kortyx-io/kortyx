import type { StudioContextResponse } from "@kortyx/telemetry-contracts";
import { describe, expect, it } from "vitest";
import {
  buildStudioShellContext,
  type StudioShellContext,
} from "@/lib/studio-context-model";

const connectedContext: StudioContextResponse = {
  organization: { name: "Local Development" },
  project: { name: "Default Project" },
  environments: ["development", "production", "test"],
  apiKey: { mode: "test", scopes: ["studio:read"] },
  api: { status: "ok", service: "kortyx-api", version: "0.1.0" },
};

const text = (value: StudioShellContext): string => JSON.stringify(value);

describe("buildStudioShellContext", () => {
  it("presents authenticated project context without key identifiers or secrets", () => {
    const context = buildStudioShellContext({
      authMode: "basic",
      studioVersion: "1.2.3",
      apiUrlConfigured: true,
      studioApiKeyConfigured: true,
      context: { data: connectedContext, error: null },
    });

    expect(context).toMatchObject({
      identity: {
        name: "Local Studio",
        access: "Basic authentication",
        version: "1.2.3",
      },
      scope: {
        label: "Local installation",
        project: "Default Project",
        telemetryEnvironments: ["development", "production", "test"],
      },
      connection: {
        status: "connected",
        label: "Connected",
        keyMode: "test",
        scopes: ["studio:read"],
      },
      configuration: {
        apiUrl: "Configured",
        studioApiKey: "Configured · ••••••••",
      },
    });
    expect(text(context)).not.toContain("ktyx_");
    expect(text(context)).not.toContain("keyId");
  });

  it("turns missing server configuration into a safe diagnostic state", () => {
    const context = buildStudioShellContext({
      authMode: "none",
      studioVersion: "0.1.0",
      apiUrlConfigured: false,
      studioApiKeyConfigured: false,
      context: {
        data: null,
        error: {
          type: "not_configured",
          message:
            "KORTYX_API_URL and KORTYX_STUDIO_API_KEY are required. secret-value",
        },
      },
    });

    expect(context.connection).toMatchObject({
      status: "misconfigured",
      label: "Configuration required",
      apiService: null,
      keyMode: null,
    });
    expect(context.identity.access).toBe("Development access");
    expect(context.configuration).toEqual({
      apiUrl: "Missing",
      studioApiKey: "Missing",
    });
    expect(text(context)).not.toContain("secret-value");
  });

  it.each([
    {
      status: 401,
      expectedStatus: "unauthorized",
      expectedLabel: "Access denied",
    },
    {
      status: 403,
      expectedStatus: "unauthorized",
      expectedLabel: "Access denied",
    },
    {
      status: 500,
      expectedStatus: "unavailable",
      expectedLabel: "API unavailable",
    },
  ])("maps HTTP $status to $expectedStatus without returning the upstream body", ({
    status,
    expectedStatus,
    expectedLabel,
  }) => {
    const context = buildStudioShellContext({
      authMode: "basic",
      studioVersion: "0.1.0",
      apiUrlConfigured: true,
      studioApiKeyConfigured: true,
      context: {
        data: null,
        error: {
          type: "http",
          status,
          message: "sensitive upstream detail",
        },
      },
    });

    expect(context.connection.status).toBe(expectedStatus);
    expect(context.connection.label).toBe(expectedLabel);
    expect(text(context)).not.toContain("sensitive upstream detail");
  });
});
