import type { ReactNode } from "react";
import type { StudioShellContext } from "../lib/studio-context-model";

export type StudioSettingsGroup =
  | "Personal"
  | "Organization"
  | "Project"
  | "Installation";

/** Server-rendered contributions to the existing Settings page, not replacement pages. */
export interface StudioSettingsContribution {
  /** Setup is UI state only; it never grants API access. */
  setupRequired?: boolean;
  onboarding?: ReactNode;
  label?: string;
  description?: string;
  /** Undefined retains the OSS card; null explicitly omits it. */
  scope?: ReactNode;
  updates?: ReactNode;
  connection?: ReactNode;
  access?: ReactNode;
  sections?: ReactNode;
  /** Edition-specific categories in the shared Settings navigation. */
  categories?: Array<{
    id: string;
    label: string;
    group?: StudioSettingsGroup;
    content: ReactNode;
  }>;
}

export interface StudioSettingsAdapter {
  /** Resolve request-local UI. Credentials must never become component props. */
  resolve(context: StudioShellContext): Promise<StudioSettingsContribution>;
}
