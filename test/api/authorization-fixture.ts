import type { CreateApiAuthorization } from "@api/authorization-contracts";

export const createApiAuthorization: CreateApiAuthorization = () => ({
  async allows(principal, action) {
    return (
      principal.kind === "human" &&
      principal.permissions.includes(`fixture:${action}`)
    );
  },
});
