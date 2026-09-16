"use client";

import type { StudioSessionDetailResponse } from "@kortyx/telemetry-contracts";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { SessionDetail } from "@/features/sessions/components/session-detail";
import { studioDetailHref } from "@/lib/studio-routes";

export function SessionDetailDrawer({
  sessionId,
  detail,
}: {
  sessionId: string;
  detail: StudioSessionDetailResponse;
}) {
  return (
    <DetailDrawer
      matchPath={studioDetailHref("sessions", sessionId)}
      dismissPath="/sessions"
      title="Session details"
      description="Replay runs, state, and lifecycle events"
    >
      <SessionDetail detail={detail} />
    </DetailDrawer>
  );
}
