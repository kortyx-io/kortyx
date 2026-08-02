import type { StudioContextResponse } from "@kortyx/telemetry-contracts";
import type { StudioApiError, StudioRepoResult } from "@/lib/studio-api";
import type { StudioAuthMode } from "@/lib/studio-auth";

export type StudioConnectionStatus =
  | "connected"
  | "misconfigured"
  | "unauthorized"
  | "unavailable";

export type StudioShellContext = {
  identity: {
    name: "Local Studio";
    access: string;
    version: string;
  };
  scope: {
    label: "Local installation";
    project: string;
    telemetryEnvironments: string[];
  };
  connection: {
    status: StudioConnectionStatus;
    label: string;
    detail: string;
    apiService: string | null;
    apiVersion: string | null;
    keyMode: "test" | "live" | null;
    scopes: string[];
  };
  configuration: {
    apiUrl: "Configured" | "Missing";
    studioApiKey: "Configured · ••••••••" | "Missing";
  };
};

type BuildStudioShellContextInput = {
  authMode: StudioAuthMode | undefined;
  studioVersion: string;
  apiUrlConfigured: boolean;
  studioApiKeyConfigured: boolean;
  context: StudioRepoResult<StudioContextResponse>;
};

const accessLabel = (mode: StudioAuthMode | undefined): string => {
  switch (mode) {
    case "basic":
      return "Basic authentication";
    case "none":
      return "Development access";
    case "cloud":
      return "Managed authentication";
    default:
      return "Invalid authentication configuration";
  }
};

const statusForError = (
  error: StudioApiError,
): Pick<StudioShellContext["connection"], "status" | "label" | "detail"> => {
  if (error.type === "not_configured") {
    return {
      status: "misconfigured",
      label: "Configuration required",
      detail: "The Studio API URL or read key is missing.",
    };
  }
  if (error.type === "http" && (error.status === 401 || error.status === 403)) {
    return {
      status: "unauthorized",
      label: "Access denied",
      detail: "The configured Studio read key is invalid or lacks permission.",
    };
  }
  return {
    status: "unavailable",
    label: "API unavailable",
    detail: "Studio could not reach or validate the telemetry API.",
  };
};

export const buildStudioShellContext = (
  input: BuildStudioShellContextInput,
): StudioShellContext => {
  const configuration: StudioShellContext["configuration"] = {
    apiUrl: input.apiUrlConfigured ? "Configured" : "Missing",
    studioApiKey: input.studioApiKeyConfigured
      ? "Configured · ••••••••"
      : "Missing",
  };
  const identity: StudioShellContext["identity"] = {
    name: "Local Studio",
    access: accessLabel(input.authMode),
    version: input.studioVersion,
  };

  if (!input.context.error) {
    return {
      identity,
      scope: {
        label: "Local installation",
        project: input.context.data.project.name,
        telemetryEnvironments: input.context.data.environments,
      },
      connection: {
        status: "connected",
        label: "Connected",
        detail: "Authenticated project context is available.",
        apiService: input.context.data.api.service,
        apiVersion: input.context.data.api.version,
        keyMode: input.context.data.apiKey.mode,
        scopes: input.context.data.apiKey.scopes,
      },
      configuration,
    };
  }

  return {
    identity,
    scope: {
      label: "Local installation",
      project: "Project unavailable",
      telemetryEnvironments: [],
    },
    connection: {
      ...statusForError(input.context.error),
      apiService: null,
      apiVersion: null,
      keyMode: null,
      scopes: [],
    },
    configuration,
  };
};
