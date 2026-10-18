import type { CreateApiTenantDatabase } from "@api/tenant-database-contracts";

export const createApiTenantDatabase: CreateApiTenantDatabase = (options) => {
  if (options.deployment !== "self-hosted") {
    throw new Error("Cloud API requires a tenant database adapter.");
  }
  return {
    withPrincipal: (_principal, work) => work(options.db),
  };
};
