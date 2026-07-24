"use client";

import type { StudioRunDetailResponse } from "@kortyx/telemetry-contracts";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { RunDetail } from "@/features/runs/components/run-detail";

export function RunDetailDrawer({
  runId,
  detail,
}: {
  runId: string;
  detail: StudioRunDetailResponse;
}) {
  return (
    <DetailDrawer
      matchPath={`/runs/${runId}`}
      dismissPath="/runs"
      title="Run details"
      description="Inspect execution, payloads, and timing"
    >
      <RunDetail detail={detail} />
    </DetailDrawer>
  );
}
