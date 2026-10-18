import type { ApiAdapterOptions, ApiPrincipal } from "../auth/contracts";

/** API operations, not identity-provider role names. Private policy maps permissions to these. */
export type ApiAction =
  | "telemetry:write"
  | "studio:read"
  | "diagnostics:read"
  | "studio:write"
  | "prompt:serve"
  | "prompt:promote"
  | "prompt:review"
  | "prompt:settings"
  | "eval:run";

export interface ApiAuthorizationAdapter {
  /** Includes project access. Only an explicit true grants the operation. */
  allows(principal: ApiPrincipal, action: ApiAction): Promise<boolean>;
}

export type CreateApiAuthorization = (
  options: ApiAdapterOptions,
) => ApiAuthorizationAdapter;
