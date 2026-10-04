import type { CreateApiTenantDatabase } from "@api/tenant-database-contracts";

export const createApiTenantDatabase: CreateApiTenantDatabase = () => ({
  async withPrincipal(principal, work) {
    // A synthetic repository handle proves the selected DB boundary is used.
    // It is NOT a transaction/RLS implementation or evidence of production isolation.
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      limit: async () => [
        {
          organizationName: principal.organizationId,
          projectName: principal.projectId,
        },
      ],
      orderBy: async () => [{ name: "fixture-environment" }],
    };
    const db = { select: () => query } as unknown as Parameters<typeof work>[0];
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        principal.kind === "human" && principal.userId === "alice" ? 20 : 5,
      ),
    );
    return work(db);
  },
});
