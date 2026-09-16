import type { FeedbackSummary } from "@kortyx/telemetry-contracts";
import { ThumbsDown, ThumbsUp } from "lucide-react";

export function FeedbackBadge({ feedback }: { feedback?: FeedbackSummary }) {
  const positive = feedback?.positive ?? 0;
  const negative = feedback?.negative ?? 0;
  if (!positive && !negative)
    return <span className="text-xs text-muted-foreground">Unrated</span>;
  return (
    <span
      role="img"
      className="inline-flex flex-wrap items-center gap-2 text-xs"
      aria-label={`${positive} positive, ${negative} negative user ratings`}
    >
      {positive > 0 && (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-1 text-emerald-700 dark:text-emerald-400">
          <ThumbsUp className="size-3" aria-hidden="true" />
          {positive}
          <span className="sr-only"> positive</span>
        </span>
      )}
      {negative > 0 && (
        <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-1 text-red-700 dark:text-red-400">
          <ThumbsDown className="size-3" aria-hidden="true" />
          {negative}
          <span className="sr-only"> negative</span>
        </span>
      )}
    </span>
  );
}
