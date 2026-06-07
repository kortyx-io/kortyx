"use client";

import { createContext, type ReactNode } from "react";
import type { FacilitatorStyleOption } from "@/services/demo-data";

/**
 * Pre-fetched list of facilitatorStyles available to the current tenant. Sourced
 * server-side at the page boundary (see `canvas-agent/page.tsx`) so the
 * canvas renders the facilitatorStyle picker without an extra round-trip and the
 * agent receives the same list in its create-canvas prompt.
 */
export const FacilitatorStylesContext = createContext<
  FacilitatorStyleOption[] | null
>(null);

export function FacilitatorStylesProvider({
  facilitatorStyles,
  children,
}: {
  facilitatorStyles: FacilitatorStyleOption[];
  children: ReactNode;
}) {
  return (
    <FacilitatorStylesContext.Provider value={facilitatorStyles}>
      {children}
    </FacilitatorStylesContext.Provider>
  );
}
