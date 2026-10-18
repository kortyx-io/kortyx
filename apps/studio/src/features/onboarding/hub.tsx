"use client";

import {
  ArrowRight,
  Bug,
  Check,
  Clock3,
  Compass,
  FileText,
  FlaskConical,
  ListChecks,
  type LucideIcon,
  MessagesSquare,
  Palette,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpCircle } from "@/components/ui/info-tooltip";
import { Separator } from "@/components/ui/separator";
import { usePathname } from "@/lib/scoped-navigation";
import { studioHelp } from "@/lib/studio-help";
import type { StudioLearningGuide } from "@/lib/studio-learning-guides";
import {
  chapterStatus,
  contextChapter,
  type LearningProgress,
  nextChapter,
} from "./progress";
import {
  CHAPTERS,
  type ChapterId,
  chapterById,
  FULL_TOUR,
  type TourMode,
} from "./registry";

export interface HubProps {
  open: boolean;
  progress: LearningProgress;
  stage: "hub" | "break" | "summary";
  summary: {
    chapter: ChapterId;
    mode: TourMode;
    completed: number;
    skipped: number;
    outcome: "completed" | "skipped";
  } | null;
  sample: boolean;
  visible: boolean;
  available: boolean;
  loading: boolean;
  storageAvailable: boolean;
  error: string;
  guides: readonly StudioLearningGuide[];
  setupHref?: string;
  onClose(): void;
  onStart(id: ChapterId, resume: boolean): void;
  onFull(): void;
  onResume(): void;
  onContinue(): void;
  onReview(): void;
  onReset(): void;
  onHome(): void;
}

const chapterIcons = {
  "sample-execution": Compass,
  "debug-execution": Bug,
  conversation: MessagesSquare,
  approvals: ShieldCheck,
  "prompt-versions": FileText,
  "evaluation-results": FlaskConical,
  personalize: Palette,
  "error-diagnostics": ScanSearch,
  "evaluation-progress": ListChecks,
} satisfies Record<ChapterId, LucideIcon>;

export function LearningHub(props: HubProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { progress, sample, loading, visible, available, stage, summary } =
    props;
  const [resetting, setResetting] = useState(false);
  const relevant = contextChapter(usePathname());
  const blocked = loading || !available;
  const completed = FULL_TOUR.filter(
    (id) => chapterStatus(progress, id) === "Completed",
  ).length;
  const point = progress.resume;
  const currentChapter = point ? chapterById(point.chapter) : null;
  const nextIndex = point ? FULL_TOUR.indexOf(point.chapter) + 1 : 0;
  const nextId = nextChapter(progress).resume?.chapter;
  const isBreak = stage === "break" && currentChapter && point;
  const isSummary = stage === "summary" && summary;

  function chapterCard(chapter: (typeof CHAPTERS)[number]) {
    const status = chapterStatus(progress, chapter.id);
    const resumable = status === "In progress";
    const action = resumable
      ? "Resume"
      : status === "Completed"
        ? "Restart"
        : "Start";
    const Icon = chapterIcons[chapter.id];
    return (
      <Card
        key={chapter.id}
        data-learning-chapter={chapter.id}
        className="gap-4 py-4 shadow-none"
      >
        <CardHeader className="gap-3 px-4">
          <div className="flex items-center justify-between gap-2">
            <span
              className="flex size-9 items-center justify-center rounded-lg border bg-muted"
              aria-hidden="true"
            >
              <Icon className="size-4" />
            </span>
            <div className="flex flex-wrap justify-end gap-1.5">
              {relevant === chapter.id && (
                <Badge variant="outline">Related to this page</Badge>
              )}
              {chapter.id === "sample-execution" &&
                status === "Not started" && (
                  <Badge variant="outline">Start here</Badge>
                )}
              {status !== "Not started" ? (
                <Badge variant="secondary">
                  {status === "Completed" && (
                    <Check aria-hidden="true" className="size-3" />
                  )}
                  {status}
                </Badge>
              ) : null}
            </div>
          </div>
          <CardTitle>
            <h3>{chapter.title}</h3>
          </CardTitle>
          <CardDescription>{chapter.description}</CardDescription>
        </CardHeader>
        <CardContent className="mt-auto px-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 aria-hidden="true" className="size-3.5" />
            {chapter.duration} · {chapter.steps.length} steps
          </p>
        </CardContent>
        <CardFooter className="justify-end gap-2 px-4">
          {resumable && (
            <Button
              size="sm"
              variant="ghost"
              disabled={blocked}
              aria-label={`Restart ${chapter.title}`}
              onClick={() => props.onStart(chapter.id, false)}
            >
              Restart
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked}
            aria-label={`${action} ${chapter.title}`}
            onClick={() => props.onStart(chapter.id, resumable)}
          >
            {action}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !loading) {
          setResetting(false);
          props.onClose();
        }
      }}
    >
      <DialogContent
        ref={contentRef}
        className="flex max-h-[min(90dvh,52rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current
            ?.querySelector<HTMLButtonElement>("[data-learning-scroll] button")
            ?.focus();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <header className="flex shrink-0 flex-col gap-1.5 px-6 py-5 pr-12">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-lg font-semibold">
              Explore Studio
            </DialogTitle>
            <HelpCircle help={studioHelp.learning} />
          </div>
          <DialogDescription>
            Choose a task to explore, or explain your current page from the
            Explore menu.
          </DialogDescription>
        </header>
        <Separator />
        <div
          data-learning-scroll="true"
          className="flex min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain p-6"
        >
          {props.error && (
            <Alert variant="destructive">
              <AlertTitle>Tour paused</AlertTitle>
              <AlertDescription>{props.error}</AlertDescription>
            </Alert>
          )}
          {!available && (
            <Alert>
              <AlertTitle>Sample project unavailable</AlertTitle>
              <AlertDescription>
                Studio could not read your sample preference. Try again later;
                your project remains available.
              </AlertDescription>
            </Alert>
          )}
          {!props.storageAvailable && (
            <output className="text-xs text-muted-foreground">
              Browser storage is unavailable. You can explore normally; progress
              will last only for this visit.
            </output>
          )}
          {!sample && (
            <p className="text-sm text-muted-foreground">
              {visible
                ? "Guides open in the read-only sample project."
                : "The sample project is hidden. Starting a guide will show it in your selector again."}
            </p>
          )}

          {isBreak ? (
            <section
              aria-label="Chapter result"
              className="flex flex-col gap-4 py-2"
            >
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  Chapter {nextIndex} of {FULL_TOUR.length}
                </Badge>
                <span className="text-sm">
                  {progress.chapters[currentChapter.id]?.status === "skipped"
                    ? "Skipped"
                    : "Completed"}
                </span>
              </div>
              <h2 className="text-base font-semibold">
                {currentChapter.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {progress.chapters[currentChapter.id]?.status === "skipped"
                  ? "You can return to this chapter from the guide library."
                  : currentChapter.outcome}
              </p>
              {nextId && (
                <p className="text-sm">Next: {chapterById(nextId).title}</p>
              )}
            </section>
          ) : isSummary ? (
            <section
              aria-label="Tour result"
              className="flex flex-col gap-4 py-2"
            >
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Check aria-hidden="true" />
                {summary.mode === "full"
                  ? "You reached the end of the full tour"
                  : summary.outcome === "completed"
                    ? "Chapter completed"
                    : "Chapter skipped"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {summary.mode === "full"
                  ? `${summary.completed} chapters completed · ${summary.skipped} skipped. You can revisit any chapter in All guides.`
                  : summary.outcome === "completed"
                    ? chapterById(summary.chapter).outcome
                    : "You can revisit this chapter whenever you need it."}
              </p>
            </section>
          ) : (
            <>
              <section
                aria-labelledby="learning-walkthrough-title"
                className="flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2
                    id="learning-walkthrough-title"
                    className="text-sm font-semibold"
                  >
                    The walkthrough
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {FULL_TOUR.length} chapters · Go at your own pace
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  New to Studio? Start with Quick orientation. Each chapter also
                  works on its own; the full tour is optional.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {CHAPTERS.filter((chapter) => chapter.fullTour).map(
                    chapterCard,
                  )}
                </div>
              </section>
              <section
                aria-labelledby="learning-optional-title"
                className="flex flex-col gap-3"
              >
                <h2
                  id="learning-optional-title"
                  className="text-sm font-semibold"
                >
                  Optional guides
                </h2>
                <p className="text-sm text-muted-foreground">
                  Go deeper when you need these tasks. These guides are outside
                  the full tour.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {CHAPTERS.filter((chapter) => !chapter.fullTour).map(
                    chapterCard,
                  )}
                </div>
              </section>
              {props.guides.length > 0 && (
                <section
                  aria-label="More workspace guides"
                  className="flex flex-col gap-3"
                >
                  <h2 className="text-sm font-semibold">Workspace guides</h2>
                  {props.guides.map((guide) => (
                    <div key={guide.id} className="flex flex-col gap-1">
                      <a
                        href={guide.href}
                        className="text-sm font-medium underline underline-offset-4"
                      >
                        {guide.title}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {guide.description}
                      </p>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
        <Separator />
        <footer
          className="flex shrink-0 flex-col gap-4 px-6 py-4"
          data-learning-footer="true"
        >
          {isBreak ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={props.onClose}>
                Finish for now
              </Button>
              <Button variant="ghost" onClick={props.onHome}>
                All guides
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={blocked}
                  onClick={props.onReview}
                >
                  Back to chapter
                </Button>
                <Button disabled={blocked} onClick={props.onContinue}>
                  Continue <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </div>
          ) : isSummary ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                disabled={blocked}
                onClick={() => props.onStart(summary.chapter, false)}
              >
                Restart chapter
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="secondary" onClick={props.onHome}>
                  All guides
                </Button>
                <Button onClick={props.onClose}>Explore on my own</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <progress
                  aria-label="Walkthrough chapters completed"
                  max={FULL_TOUR.length}
                  value={completed}
                  className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {completed} of {FULL_TOUR.length} chapters completed
                </span>
              </div>
              {resetting ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="w-full text-xs text-muted-foreground">
                    Reset all chapter progress? Your sample visibility stays
                    unchanged.
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      props.onReset();
                      setResetting(false);
                    }}
                  >
                    Reset progress
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setResetting(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setResetting(true)}
                  >
                    <RotateCcw data-icon="inline-start" />
                    Reset tour progress
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={blocked}
                      variant={point ? "secondary" : "primary"}
                      onClick={props.onFull}
                    >
                      <Compass data-icon="inline-start" />
                      Take the full tour
                    </Button>
                    {point && (
                      <Button disabled={blocked} onClick={props.onResume}>
                        Resume tour
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
