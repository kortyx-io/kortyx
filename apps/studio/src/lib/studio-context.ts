import "server-only";

import { cache } from "react";
import { getStudioContext } from "@/lib/studio-api";
import { resolveStudioAuthMode } from "@/lib/studio-auth";
import {
  buildStudioShellContext,
  type StudioShellContext,
} from "@/lib/studio-context-model";
import studioPackage from "../../package.json";

export const getStudioShellContext = cache(
  async (): Promise<StudioShellContext> => {
    const context = await getStudioContext();
    return buildStudioShellContext({
      authMode: resolveStudioAuthMode(),
      studioVersion:
        process.env.KORTYX_STUDIO_VERSION?.trim() || studioPackage.version,
      apiUrlConfigured: Boolean(process.env.KORTYX_API_URL),
      studioApiKeyConfigured: Boolean(process.env.KORTYX_STUDIO_API_KEY),
      context,
    });
  },
);
