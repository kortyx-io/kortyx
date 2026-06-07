"use client";

import { useContext } from "react";
import { FacilitatorStylesContext } from "@/providers/facilitator-styles-store";
import type { FacilitatorStyleOption } from "@/services/demo-data";

export function useFacilitatorStyles(): FacilitatorStyleOption[] {
  const value = useContext(FacilitatorStylesContext);
  if (value === null) {
    throw new Error(
      "useFacilitatorStyles must be used inside <FacilitatorStylesProvider>",
    );
  }
  return value;
}
