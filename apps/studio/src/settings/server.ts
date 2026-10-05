import "server-only";
import type { StudioSettingsAdapter } from "./contracts";

/** Self-hosted Studio retains its existing local configuration cards. */
export const studioSettings: StudioSettingsAdapter = {
  async resolve() {
    return {};
  },
};
