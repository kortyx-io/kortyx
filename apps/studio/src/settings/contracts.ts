import type { ReactNode } from "react";
import type { StudioShellContext } from "../lib/studio-context-model";

/** Server-rendered contributions to the existing Settings page, not replacement pages. */
export interface StudioSettingsContribution {
  label?: string;
  description?: string;
  /** Undefined retains the OSS card; null explicitly omits it. */
  scope?: ReactNode;
  updates?: ReactNode;
  connection?: ReactNode;
  access?: ReactNode;
  sections?: ReactNode;
}

export interface StudioSettingsAdapter {
  /** Resolve request-local UI. Credentials must never become component props. */
  resolve(context: StudioShellContext): Promise<StudioSettingsContribution>;
}
