import type {
  AuthenticatedTelemetryProject,
  TelemetryDb,
} from "@kortyx/telemetry-db";

export type ApiEnv = {
  Variables: {
    auth: AuthenticatedTelemetryProject;
    db: TelemetryDb;
    requestId: string;
  };
};
