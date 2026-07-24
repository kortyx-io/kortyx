"use client";

import type { StudioInterruptDetailResponse } from "@kortyx/telemetry-contracts";
import { DetailDrawer } from "@/components/detail/detail-drawer";
import { InterruptDetail } from "@/features/interrupts/components/interrupt-detail";

export function InterruptDetailDrawer({
  interruptId,
  detail,
}: {
  interruptId: string;
  detail: StudioInterruptDetailResponse;
}) {
  return (
    <DetailDrawer
      matchPath={`/interrupts/${interruptId}`}
      dismissPath="/interrupts"
      title="Interrupt details"
      description="Inspect the decision and resume audit trail"
    >
      <InterruptDetail detail={detail} />
    </DetailDrawer>
  );
}
