import type { ReactNode } from "react";
import type { StudioShellContext } from "../lib/studio-context-model";

/** Compiled, request-local shell contributions. No tokens or key material. */
export interface StudioShellContribution {
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
}
