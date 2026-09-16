"use client";

import type { StudioRunDetailResponse } from "@kortyx/telemetry-contracts";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { RunDetail } from "@/features/runs/components/run-detail";
import { studioDetailHref } from "@/lib/studio-routes";

export function RunDetailDrawer({
  runId,
  detail,
}: {
  runId: string;
  detail: StudioRunDetailResponse;
}) {
  return (
    <DetailDrawer
      matchPath={studioDetailHref("runs", runId)}
      dismissPath="/runs"
      title="Run details"
      description="Inspect execution, payloads, and timing"
    >
      <RunDetail detail={detail} />
    </DetailDrawer>
  );
}
