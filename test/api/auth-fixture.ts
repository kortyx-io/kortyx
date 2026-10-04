import type { CreateApiAuth } from "@api/auth-contracts";

/** Test credentials only. This file is never selected by the public deployment profile. */
export const createApiAuth: CreateApiAuth = () => ({
  async authenticate(request) {
    const token = request.headers.get("authorization");
    if (token !== "Bearer fixture-alice" && token !== "Bearer fixture-bob") {
      throw new Error("Fixture authentication denied.");
    }
    const actor = token.slice("Bearer fixture-".length);
    return {
      kind: "human",
      userId: actor,
      organizationId: `fixture-org-${actor}`,
      projectId: `fixture-project-${actor}`,
      permissions: ["fixture:studio:read"],
    };
  },
});
