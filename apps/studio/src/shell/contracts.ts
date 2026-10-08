import type { ReactNode } from "react";
import type { StudioShellContext } from "../lib/studio-context-model";
import type { StudioRouteScope } from "../lib/studio-routing";

/** Compiled, request-local shell contributions. No tokens or key material. */
export interface StudioShellContribution {
  routeScope?: StudioRouteScope;
  organizationSwitcher?: ReactNode;
  projectSwitcher?: ReactNode;
  environmentSwitcher?: ReactNode;
  account?: {
    name: string;
    email: string;
    /** Session-bound proof for the existing POST logout, not a credential. */
    logoutCsrf: string;
  };
}

export interface StudioShellAdapter {
  /** Optional request-local entry flow, inside the shared Studio root/theme. */
  entryLayout?(children: ReactNode): Promise<ReactNode | null>;
  resolve(context: StudioShellContext): Promise<StudioShellContribution>;
}
