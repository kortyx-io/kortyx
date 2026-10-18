import type { ApiPrincipal } from "./auth/contracts";
import type { ApiAuthorizationAdapter } from "./authorization/contracts";
import type { ApiTenantDatabase } from "./database/contracts";

export type ApiEnv = {
  Variables: {
    principal: ApiPrincipal;
    authorization: ApiAuthorizationAdapter;
    withTenantDatabase: ApiTenantDatabase;
    revalidateStreamAccess: () => Promise<void>;
    requestId: string;
  };
};
