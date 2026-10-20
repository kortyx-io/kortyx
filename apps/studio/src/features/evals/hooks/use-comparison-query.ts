"use client";
import { parseAsBoolean } from "nuqs";
import { useStudioQueryStates } from "@/lib/nuqs";
import { useSearchParams } from "@/lib/scoped-navigation";
import { comparisonQueryParsers } from "../lib/comparison-query";
export function useComparisonQuery() {
  const search = useSearchParams();
  // Evidence disclosures have case-specific keys. Register only this surface’s
  // keys so closing can clear them atomically without touching table state.
  const disclosures = Object.fromEntries(
    [...search.keys()]
      .filter((key) => key.startsWith("expand.change-"))
      .map((key) => [key, parseAsBoolean]),
  );
  return useStudioQueryStates(
    { ...disclosures, ...comparisonQueryParsers },
    { shallow: true },
  );
}
