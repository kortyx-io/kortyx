import "server-only";
import type { StudioShellAdapter } from "./contracts";

/** An operator-managed installation has no managed user or team account. */
export const studioShell: StudioShellAdapter = {
  async resolve() {
    return {};
  },
};
