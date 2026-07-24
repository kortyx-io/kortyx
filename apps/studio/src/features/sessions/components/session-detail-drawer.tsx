"use client";

import type { StudioSessionDetailResponse } from "@kortyx/telemetry-contracts";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { SessionDetail } from "@/features/sessions/components/session-detail";

export function SessionDetailDrawer({
  sessionId,
  detail,
}: {
  sessionId: string;
  detail: StudioSessionDetailResponse;
}) {
  return (
    <DetailDrawer
      matchPath={`/sessions/${sessionId}`}
      dismissPath="/sessions"
      title="Session details"
      description="Replay runs, state, and lifecycle events"
    >
      <SessionDetail detail={detail} />
    </DetailDrawer>
  );
}
