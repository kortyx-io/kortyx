import "server-only";
import { cookies } from "next/headers";
import { createElement } from "react";
import type { StudioSettingsAdapter } from "./contracts";
import { LocalStudioSetup } from "./setup";
import { LOCAL_SETUP_COOKIE } from "./setup-state";

/** Self-hosted Studio retains its existing local configuration cards. */
export const studioSettings: StudioSettingsAdapter = {
  async resolve(context) {
    const setupRequired =
      (await cookies()).get(LOCAL_SETUP_COOKIE)?.value !== "1";
    return {
      setupRequired,
      onboarding: setupRequired
        ? createElement(LocalStudioSetup, {
            connected: context.connection.status === "connected",
          })
        : null,
    };
  },
};
