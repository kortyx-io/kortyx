"use client";

import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDashed,
  CirclePause,
  Clock3,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import { CompactStatus } from "@/features/telemetry/components/compact-status";
export function EvalStatus({
  status,
  termination,
  filterField,
}: {
  status: string;
  filterField?: string;
  termination?: { code: string } | null;
}) {
  const filterValue = status;
  if (status === "error" && termination?.code === "EVAL_RUN_TIMEOUT")
    status = "timed-out";
  const neutral = "text-muted-foreground";
  const meta = {
    mixed: {
      label: "Mixed results",
      icon: CircleDashed,
      className: "text-muted-foreground",
    },
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
    "timed-out": {
      label: "Timed out",
      icon: Clock3,
      className: "text-amber-700 dark:text-amber-400",
    },
    error: {
      label: "Error",
      icon: CircleAlert,
      className: "text-red-700 dark:text-red-400",
    },
    interrupted: {
      label: "Interrupted",
      icon: CirclePause,
      className: "text-amber-700 dark:text-amber-400",
    },
    retrying: { label: "Retrying", icon: Clock3, className: neutral },
    reconnecting: {
      label: "Reconnecting",
      icon: LoaderCircle,
      className: neutral,
      animate: true,
    },
    unknown: { label: "Status unknown", icon: CircleAlert, className: neutral },
    queued: { label: "Queued", icon: Clock3, className: neutral },
    running: {
      label: "Running",
      icon: LoaderCircle,
      className: "text-blue-700 dark:text-blue-400",
      animate: true,
    },
    ungraded: {
      label: "Awaiting evaluation",
      icon: Clock3,
      className: neutral,
    },
    cancelled: { label: "Cancelled", icon: CirclePause, className: neutral },
    "not-run": { label: "Not run", icon: Circle, className: neutral },
  };
  return (
    <CompactStatus
      filterValue={filterValue}
      filterField={filterField}
      meta={meta[status as keyof typeof meta] ?? meta["not-run"]}
    />
  );
}
