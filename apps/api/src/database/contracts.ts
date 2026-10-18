import type { TelemetryDb } from "@kortyx/telemetry-db";
import type { ApiAdapterOptions, ApiPrincipal } from "../auth/contracts";

export type ApiDatabaseOperation<T> = (db: TelemetryDb) => Promise<T>;
export type ApiTenantDatabase = <T>(
  work: ApiDatabaseOperation<T>,
) => Promise<T>;

export interface ApiTenantDatabaseAdapter {
  /** Cloud implementations use a transaction handle with SET LOCAL tenant context and RLS.
   * Never wrap Hono next(): it handles downstream exceptions instead of rethrowing them.
   * Work must return materialized data, not a lazy query/stream that outlives its transaction.
   */
  withPrincipal<T>(
    principal: ApiPrincipal,
    work: ApiDatabaseOperation<T>,
  ): Promise<T>;
}

export type CreateApiTenantDatabase = (
  options: ApiAdapterOptions,
) => ApiTenantDatabaseAdapter;
