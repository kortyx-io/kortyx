"use client";

import { SAMPLE_PROJECT } from "@kortyx/telemetry-contracts";
import { useStudioRouteScope } from "@/components/studio-route-provider";

/** Sample execution states are snapshots, including time spent awaiting grading. */
export function useEvalReferenceTime(): number | undefined {
  return useStudioRouteScope()?.sampleProject
    ? Date.parse(SAMPLE_PROJECT.referenceTime)
    : undefined;
}
