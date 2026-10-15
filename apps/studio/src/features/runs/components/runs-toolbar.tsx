import { ListToolbar } from "@/features/telemetry/components/list-toolbar";
import type { LiveRefreshStatus } from "@/features/telemetry/lib/live-refresh-controller";

type RunsToolbarProps = {
  live: boolean;
  liveStatus: LiveRefreshStatus;
  refreshing: boolean;
  onToggleLive: () => void;
  onRefresh: () => void;
};

export function RunsToolbar(props: RunsToolbarProps) {
  return (
    <ListToolbar
      title="Runs"
      subtitle="Operational inbox for every execution"
      {...props}
    />
  );
}
