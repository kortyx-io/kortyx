import type { CreateApiAuthorization } from "@api/authorization-contracts";

export const createApiAuthorization: CreateApiAuthorization = (options) => {
  if (options.deployment !== "self-hosted") {
    throw new Error("Cloud API requires an authorization adapter.");
  }
  return {
    async allows(principal, action) {
      return principal.kind === "api-key" && principal.scopes.includes(action);
    },
  };
};
