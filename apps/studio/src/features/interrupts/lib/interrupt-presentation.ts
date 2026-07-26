import type {
  StudioInterruptInteractionMode,
  StudioInterruptStatus,
  StudioInterruptType,
} from "@kortyx/telemetry-contracts";
import { resolveStudioInterruptStatus } from "@kortyx/telemetry-contracts";
import { formatDurationSeconds } from "@/lib/format";

type InterruptPresentationInput = {
  interactionMode: StudioInterruptInteractionMode;
  type: StudioInterruptType;
  optionCount: number | null;
};

export const interruptInteractionLabel = ({
  interactionMode,
  type,
  optionCount,
}: InterruptPresentationInput): string => {
  if (interactionMode === "dynamic-picker") return "Dynamic picker";
  if (interactionMode === "freeform") return "Free-form response";
  if (interactionMode === "static-options") {
    const count = optionCount ?? 0;
    return `${count} static ${count === 1 ? "option" : "options"}`;
  }
  if (type === "choice" || type === "multi-choice") {
    return "Choice source unknown";
  }
  return "Interaction unknown";
};

export const interruptTypeLabel = (type: StudioInterruptType): string => {
  if (type === "multi-choice") return "Multiple choice";
  if (type === "choice") return "Single choice";
  if (type === "text") return "Text";
  return "Unknown type";
};

type InterruptLifecycleInput = {
  status: StudioInterruptStatus;
  createdAt: string;
  resolvedAt?: string | null | undefined;
  expiresAt?: string | null | undefined;
};

export const effectiveInterruptStatus = (
  interrupt: Pick<InterruptLifecycleInput, "status" | "expiresAt">,
  now: number,
): StudioInterruptStatus => resolveStudioInterruptStatus(interrupt, now);

export const interruptStatusLabel = (status: StudioInterruptStatus): string => {
  if (status === "pending") return "Waiting for input";
  if (status === "expired") return "Input expired";
  if (status === "resolved") return "Resolved";
  if (status === "cancelled") return "Cancelled";
  return "Failed";
};

export const interruptTimingPresentation = (
  interrupt: InterruptLifecycleInput,
  now: number,
): { label: string; title: string } => {
  const createdAt = Date.parse(interrupt.createdAt);
  const resolvedAt = interrupt.resolvedAt
    ? Date.parse(interrupt.resolvedAt)
    : Number.NaN;
  const expiresAt = interrupt.expiresAt
    ? Date.parse(interrupt.expiresAt)
    : Number.NaN;
  if (!Number.isFinite(createdAt)) {
    return { label: "Unknown", title: "Timing was not captured" };
  }

  const status = effectiveInterruptStatus(interrupt, now);
  const duration = (end: number) =>
    Math.max(0, Math.floor((end - createdAt) / 1_000));
  const compact = (seconds: number) => formatDurationSeconds(seconds);
  const full = (seconds: number) =>
    formatDurationSeconds(seconds, { style: "full" });

  if (status === "pending") {
    const waited = duration(now);
    if (Number.isFinite(expiresAt)) {
      const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1_000));
      return {
        label: `Waiting ${compact(waited)} · expires in ${compact(remaining)}`,
        title: `Waiting ${full(waited)}; expires in ${full(remaining)}`,
      };
    }
    return {
      label: `Waiting ${compact(waited)}`,
      title: `Waiting ${full(waited)}; no expiry was captured`,
    };
  }

  if (status === "expired") {
    const boundary = Number.isFinite(expiresAt)
      ? expiresAt
      : Number.isFinite(resolvedAt)
        ? resolvedAt
        : now;
    const lifetime = duration(boundary);
    const expiredAgo = Math.max(0, Math.floor((now - boundary) / 1_000));
    return {
      label: `Expired after ${compact(lifetime)} · ${compact(expiredAgo)} ago`,
      title: `Expired after ${full(lifetime)}; ${full(expiredAgo)} ago`,
    };
  }

  const boundary = Number.isFinite(resolvedAt) ? resolvedAt : now;
  const elapsed = duration(boundary);
  const verb =
    status === "resolved"
      ? "Resolved"
      : status === "cancelled"
        ? "Cancelled"
        : "Failed";
  return {
    label: `${verb} in ${compact(elapsed)}`,
    title: `${verb} in ${full(elapsed)}`,
  };
};
