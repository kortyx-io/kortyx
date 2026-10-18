import type { StudioAuthAdapter } from "@studio/auth-contracts";

/** Intentionally invalid: the selected profile must reject this adapter. */
export const studioAuth = {
  async authorize() {
    return null;
  },
  async getApiCredential() {
    return { authorization: 123 };
  },
  async handleAuthRequest() {
    return new Response();
  },
} satisfies StudioAuthAdapter;
