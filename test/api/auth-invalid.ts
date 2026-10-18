import type { CreateApiAuth } from "@api/auth-contracts";

export const createApiAuth: CreateApiAuth = () => ({
  async authenticate() {
    return 42;
  },
});
