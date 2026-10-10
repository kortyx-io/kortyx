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
  resolve(context: StudioShellContext): Promise<StudioShellContribution>;
  /** Optional edition onboarding, rendered inside the existing Studio layout. */
  onboardingPage?(): Promise<ReactNode>;
}
