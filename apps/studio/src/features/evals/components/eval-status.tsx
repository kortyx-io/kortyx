import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CirclePause,
  Clock3,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import { CompactStatus } from "@/features/telemetry/components/compact-status";
export function EvalStatus({ status }: { status: string }) {
  const neutral = "text-muted-foreground";
  const meta = {
    passed: {
      label: "Passed",
      icon: CheckCircle2,
      className: "text-emerald-700 dark:text-emerald-400",
    },
    failed: {
      label: "Failed",
      icon: XCircle,
      className: "text-red-700 dark:text-red-400",
    },
    error: {
      label: "Error",
      icon: CircleAlert,
      className: "text-red-700 dark:text-red-400",
    },
    queued: { label: "Queued", icon: Clock3, className: neutral },
    running: {
      label: "Running",
      icon: LoaderCircle,
      className: "text-blue-700 dark:text-blue-400",
      animate: true,
    },
    cancelled: { label: "Cancelled", icon: CirclePause, className: neutral },
    "not-run": { label: "Not run", icon: Circle, className: neutral },
  };
  return (
    <CompactStatus
      meta={meta[status as keyof typeof meta] ?? meta["not-run"]}
    />
  );
}
