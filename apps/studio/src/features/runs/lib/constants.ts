import {
  CircleAlert,
  CircleCheck,
  CirclePause,
  CircleX,
  LoaderCircle,
} from "lucide-react";
import type { RunStatus } from "@/features/runs/types";

export const statusMeta: Record<
  RunStatus,
  { label: string; icon: typeof CircleCheck; className: string }
> = {
  running: { label: "Running", icon: LoaderCircle, className: "text-blue-600" },
  completed: {
    label: "Completed",
    icon: CircleCheck,
    className: "text-emerald-600",
  },
  interrupted: {
    label: "Interrupted",
    icon: CirclePause,
    className: "text-amber-600",
  },
  failed: { label: "Failed", icon: CircleAlert, className: "text-red-600" },
  cancelled: {
    label: "Cancelled",
    icon: CircleX,
    className: "text-muted-foreground",
  },
};

export const statuses = Object.keys(statusMeta) as RunStatus[];
export const providers = ["OpenAI", "Anthropic", "Google"] as const;
export const timeRanges = ["Last hour", "24 hours", "7 days", "Custom range"];
export const PAGE_SIZE = 20;
export const PAGE_SIZES = [10, 20, 50] as const;
export const COLUMN_LAYOUT_STORAGE_KEY = "kortyx:runs:column-widths";
