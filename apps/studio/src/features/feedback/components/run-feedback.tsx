"use client";

import {
  type StudioReviewRequest,
  type StudioRunDetailResponse,
  type StudioScore,
  StudioScoreResponseSchema,
} from "@kortyx/telemetry-contracts";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { DetailLink } from "@/components/detail/detail-link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/format";
import { studioDetailHref } from "@/lib/studio-routes";
import { FeedbackBadge } from "./feedback-badge";

const verdictLabels = {
  correct: "Correct",
  "partially-correct": "Partially correct",
  incorrect: "Incorrect",
};
const sourceLabels = {
  "end-user": "End user",
  "human-review": "Human review",
  evaluator: "Evaluator",
};

function ScoreItem({ score }: { score: StudioScore }) {
  const label =
    score.dataType === "BOOLEAN"
      ? score.value === 1
        ? "Positive"
        : "Negative"
      : String(score.value);
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {score.name === "correctness"
              ? (verdictLabels[score.value as keyof typeof verdictLabels] ??
                label)
              : label}
          </span>
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {sourceLabels[score.source]}
          </span>
        </div>
        <time
          dateTime={score.updatedAt}
          className="text-xs text-muted-foreground"
        >
          {formatDateTime(score.updatedAt)}
        </time>
      </div>
      {score.comment && (
        <p className="whitespace-pre-wrap break-words text-sm">
          {score.comment}
        </p>
      )}
      {score.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {score.reasons.map((reason) => (
            <span
              key={reason}
              className="rounded border px-2 py-0.5 text-xs capitalize"
            >
              {reason}
            </span>
          ))}
        </div>
      )}
      <p className="break-all font-mono text-xs text-muted-foreground">
        {score.actorId} · {score.name} · Run-level
      </p>
    </article>
  );
}

export function RunFeedback({ detail }: { detail: StudioRunDetailResponse }) {
  const router = useRouter();
  const fieldId = useId();
  const [scores, setScores] = useState(detail.scores ?? []);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<StudioReviewRequest["value"]>("incorrect");
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setScores(detail.scores ?? []);
  }, [detail.scores]);
  const feedback = scores.filter((score) => score.source === "end-user");
  const reviews = scores.filter((score) => score.source === "human-review");
  const ownReview = reviews.find(
    (score) =>
      score.actorId === detail.reviewActorId && score.name === "correctness",
  );

  function startReview() {
    setValue((ownReview?.value as StudioReviewRequest["value"]) ?? "incorrect");
    setComment(ownReview?.comment ?? "");
    setEditing(true);
    setError(null);
    setNotice("");
  }

  async function saveReview(method: "POST" | "DELETE") {
    setPending(true);
    setError(null);
    setNotice("");
    try {
      const response = await fetch(
        `/api/studio/runs/${encodeURIComponent(detail.run.id)}/review`,
        {
          method,
          headers: {
            "content-type": "application/json",
            "x-kortyx-review": "1",
          },
          ...(method === "POST"
            ? { body: JSON.stringify({ value, comment: comment || null }) }
            : {}),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Could not save review.",
        );
      if (method === "POST") {
        const { score } = StudioScoreResponseSchema.parse(body);
        setScores((current) => [
          score,
          ...current.filter((item) => item.id !== score.id),
        ]);
      } else
        setScores((current) =>
          current.filter((item) => item.id !== ownReview?.id),
        );
      setEditing(false);
      setNotice(method === "POST" ? "Review saved." : "Review cleared.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save review.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6 p-4 @lg:p-6">
      <section className="space-y-4" aria-label="User feedback">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">User feedback</h3>
          <FeedbackBadge feedback={detail.run.feedback} />
        </div>
        <p className="text-xs text-muted-foreground">
          User satisfaction is separate from execution status and reviewer
          judgments.
        </p>
        {feedback.length ? (
          feedback.map((score) => <ScoreItem key={score.id} score={score} />)
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No user feedback received.
          </p>
        )}
        <DetailLink
          href={studioDetailHref("runs", detail.run.id, { tab: "overview" })}
          className="text-xs underline"
        >
          View input and response
        </DetailLink>
      </section>
      <section className="space-y-4 border-t pt-5" aria-label="Human reviews">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Human reviews</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={startReview}
            disabled={!detail.canReview || pending}
          >
            {ownReview ? "Edit review" : "Add review"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {detail.canReview
            ? "Reviews are attributed to this Studio API key. Shared installations share a reviewer identity."
            : "Read-only access. A Studio key with studio:read and studio:write scopes is required to add reviews."}
        </p>
        {reviews.map((score) => (
          <ScoreItem key={score.id} score={score} />
        ))}
        {!reviews.length && !editing && (
          <p className="text-sm text-muted-foreground">No human reviews yet.</p>
        )}
        {editing && (
          <form
            className="space-y-3 rounded-lg border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveReview("POST");
            }}
          >
            <label
              id={`${fieldId}-verdict-label`}
              htmlFor={`${fieldId}-verdict`}
              className="block text-xs font-medium"
            >
              Correctness
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id={`${fieldId}-verdict`}
                  type="button"
                  variant="outline"
                  disabled={pending}
                  aria-labelledby={`${fieldId}-verdict-label ${fieldId}-verdict-value`}
                  className="max-w-full justify-between"
                >
                  <span id={`${fieldId}-verdict-value`}>
                    {verdictLabels[value]}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 opacity-50"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-(--radix-dropdown-menu-trigger-width)"
                onEscapeKeyDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <DropdownMenuRadioGroup
                  aria-label="Correctness"
                  value={value}
                  onValueChange={(selected) =>
                    setValue(selected as StudioReviewRequest["value"])
                  }
                >
                  {Object.entries(verdictLabels).map(([key, label]) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <label
              htmlFor={`${fieldId}-comment`}
              className="block text-xs font-medium"
            >
              Reviewer note (optional)
            </label>
            <textarea
              id={`${fieldId}-comment`}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={4000}
              disabled={pending}
              rows={4}
              placeholder="What should the response have done?"
              className="w-full rounded-md border bg-background p-3 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save review"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              {ownReview && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void saveReview("DELETE")}
                >
                  Clear review
                </Button>
              )}
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <output className="block text-xs text-muted-foreground">
          {notice}
        </output>
      </section>
    </div>
  );
}
