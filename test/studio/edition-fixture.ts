import "server-only";
import type { StudioEdition } from "../../apps/studio/src/lib/edition-contracts";

/** Build/smoke-test fixture only. Not a Cloud auth implementation. */
export const studioEdition: StudioEdition = {
  async authorize(request) {
    return new URL(request.url).pathname.startsWith("/auth/")
      ? null
      : new Response("Fixture denies application access", { status: 401 });
  },
  async getApiCredential() {
    return null;
  },
  async handleAuthRequest() {
    return Response.json({ edition: "compiled-edition-fixture" });
  },
};
