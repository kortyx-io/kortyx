import type { ReactNode } from "react";
import type { StudioShellContext } from "../lib/studio-context-model";
import type { StudioLearningGuide } from "../lib/studio-learning-guides";
import type { StudioRouteScope } from "../lib/studio-routing";

/** Compiled, request-local shell contributions. No tokens or key material. */
export interface StudioShellContribution {
  routeScope?: StudioRouteScope;
  /** Authorized, local help destinations for optional edition/admin topics. */
  learningGuides?: readonly StudioLearningGuide[];
  organizationSwitcher?: ReactNode;
  projectSwitcher?: ReactNode;
  /** Safe display label for the selected real project while exploring sample data. */
  projectName?: string;
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
