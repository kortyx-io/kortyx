import type { ApiKeyMode, TelemetryDb } from "@kortyx/telemetry-db";

export type ApiDeployment = "self-hosted" | "cloud";
export type ApiSurface = "studio" | "telemetry";

/** Internal product IDs, resolved by trusted code—not copied from request headers. */
export type ApiProjectScope = Readonly<{
  organizationId: string;
  projectId: string;
}>;

export type ApiKeyPrincipal = ApiProjectScope &
  Readonly<{
    kind: "api-key";
    keyId: string;
    mode: ApiKeyMode;
    scopes: readonly string[];
  }>;

/** Authentication must validate membership and resolve the selected project's organization. */
export type ApiHumanPrincipal = ApiProjectScope &
  Readonly<{
    kind: "human";
    userId: string;
    permissions: readonly string[];
  }>;

export type ApiPrincipal = ApiKeyPrincipal | ApiHumanPrincipal;

export type ApiAdapterOptions = Readonly<{
  db: TelemetryDb;
  apiKeyPepper: string;
  deployment: ApiDeployment;
}>;

export interface ApiAuthAdapter {
  /** Throw on invalid credentials. Never downgrade a failed token to another identity. */
  authenticate(request: Request, surface: ApiSurface): Promise<ApiPrincipal>;
}

export type CreateApiAuth = (options: ApiAdapterOptions) => ApiAuthAdapter;
