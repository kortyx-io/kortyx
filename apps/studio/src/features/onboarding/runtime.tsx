"use client";

import { X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import {
  type ArrowRenderProps,
  EVENTS,
  STATUS,
  type Step,
  type TooltipRenderProps,
  useJoyride,
} from "react-joyride";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OVERLAY_LAYERS } from "@/lib/overlay-layers";
import { useRouter } from "@/lib/scoped-navigation";
import {
  type ChapterId,
  chapterById,
  FULL_TOUR,
  resolveView,
  type TourMode,
} from "./registry";
import { findLessonTarget, lessonTargetReady } from "./targets";
import { waitForTourTarget } from "./wait-for-target";

export interface RuntimeProps {
  chapter: ChapterId;
  mode: TourMode;
  initialStep: string;
  onStep: (id: string) => void;
  onEnd: (
    outcome: "completed" | "skipped" | "failed",
    failedStep?: string,
  ) => void;
  onExit: () => void;
  onPrevious: () => void;
  onStart: () => void;
}
const RuntimeContext = createContext<
  | (Pick<RuntimeProps, "onExit" | "onPrevious"> & {
      chapter: ChapterId;
      mode: TourMode;
    })
  | null
>(null);

/** Leave the base open and overlap the panel border by one pixel. */
function LearningArrow({ base, placement, size }: ArrowRenderProps) {
  const side = placement.split("-")[0];
  const vertical = side === "top" || side === "bottom";
  const width = vertical ? base : size;
  const height = vertical ? size : base;
  const points =
    side === "top"
      ? `0,-1 ${base / 2},${size} ${base},-1`
      : side === "bottom"
        ? `0,${size + 1} ${base / 2},0 ${base},${size + 1}`
        : side === "left"
          ? `-1,0 ${size},${base / 2} -1,${base}`
          : `${size + 1},0 0,${base / 2} ${size + 1},${base}`;
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
      data-tour-arrow="true"
    >
      <polygon points={points} fill="var(--popover)" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LearningTooltip({
  backProps,
  primaryProps,
  skipProps,
  index,
  size,
  step,
  tooltipProps,
  isLastStep,
}: TooltipRenderProps) {
  const context = useContext(RuntimeContext);
  if (!context) return null;
  const chapterIndex = FULL_TOUR.indexOf(context.chapter);
  const canGoBackChapter = context.mode === "full" && chapterIndex > 0;
  return (
    <div
      {...tooltipProps}
      role="alertdialog"
      data-slot="dialog-content"
      data-studio-tour="true"
      aria-labelledby="studio-lesson-title"
      aria-describedby="studio-lesson-description"
      className="w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <h2 id="studio-lesson-title" className="pt-0.5 text-sm font-semibold">
          {step.title}
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Exit tour"
          onClick={context.onExit}
        >
          <X />
        </Button>
      </header>
      <p id="studio-lesson-description" className="px-4 pt-2 text-sm">
        {step.content}
      </p>
      <div className="flex flex-wrap items-center gap-2 p-4">
        <Button {...skipProps} variant="ghost" size="sm" className="mr-auto">
          {context.mode === "full" ? "Skip chapter" : "Skip"}
        </Button>
        <Button
          {...backProps}
          variant="secondary"
          size="sm"
          disabled={index === 0 && !canGoBackChapter}
          onClick={
            index === 0 && canGoBackChapter
              ? context.onPrevious
              : backProps.onClick
          }
        >
          Back
        </Button>
        <Button {...primaryProps} size="sm">
          {isLastStep ? "Done" : "Next"}
        </Button>
      </div>
      <Separator />
      <footer className="flex flex-wrap items-center justify-between gap-1 px-4 py-3 text-xs text-muted-foreground">
        <span>
          {chapterById(context.chapter).title} · Step {index + 1} of {size}
        </span>
        {context.mode === "full" && (
          <span>
            Chapter {chapterIndex + 1} of {FULL_TOUR.length}
          </span>
        )}
      </footer>
    </div>
  );
}

export function LearningRuntime(props: RuntimeProps) {
  const { chapter: chapterId, mode, initialStep, onExit, onPrevious } = props;
  const chapter = chapterById(chapterId);
  const router = useRouter();
  const navigation = useRef(router);
  navigation.current = router;
  const pending = useRef(new Set<AbortController>());
  const ended = useRef(false);
  const started = useRef(false);
  // Event handlers always use the latest checkpoint callbacks without rebuilding steps.
  const callbacks = useRef(props);
  callbacks.current = props;
  useEffect(() => {
    const controllers = pending.current;
    return () => {
      for (const controller of controllers) controller.abort();
    };
  }, []);
  const steps = useMemo<Step[]>(
    () =>
      chapter.steps.map((step) => {
        const { href, target } = resolveView(step.view);
        return {
          id: step.id,
          title: step.title,
          content: step.content,
          target: () => findLessonTarget(target),
          placement: "bottom-start",
          before: async () => {
            const controller = new AbortController();
            pending.current.add(controller);
            const destination = new URL(
              `/sample${href}`,
              window.location.origin,
            );
            if (
              window.location.pathname + window.location.search !==
              destination.pathname + destination.search
            )
              navigation.current.replace(href, {
                scroll: false,
                signal: controller.signal,
                shallow: step.view.surface === "prompt",
              });
            try {
              await waitForTourTarget(
                () => lessonTargetReady(target, destination),
                controller.signal,
              );
            } finally {
              pending.current.delete(controller);
            }
          },
        };
      }),
    [chapter],
  );

  const { Tour, state } = useJoyride({
    steps,
    run: true,
    continuous: true,
    initialStepIndex: Math.max(
      0,
      chapter.steps.findIndex((step) => step.id === initialStep),
    ),
    scrollToFirstStep: true,
    tooltipComponent: LearningTooltip,
    arrowComponent: LearningArrow,
    floatingOptions: { shiftOptions: { crossAxis: true } },
    locale: {
      last: "Done",
      skip: mode === "full" ? "Skip chapter" : "Skip",
    },
    options: {
      skipBeacon: true,
      blockTargetInteraction: true,
      overlayClickAction: false,
      dismissKeyAction: false,
      beforeTimeout: 16_000,
      targetWaitTimeout: 2_000,
      scrollDuration: 0,
      zIndex: OVERLAY_LAYERS.tour,
      arrowColor: "var(--popover)",
      backgroundColor: "var(--popover)",
      textColor: "var(--popover-foreground)",
      overlayColor: "var(--tour-overlay)",
    },
    onEvent(event) {
      if (ended.current) return;
      if (event.type === EVENTS.TOUR_START && !started.current) {
        started.current = true;
        callbacks.current.onStart();
      }
      if (event.type === EVENTS.TOOLTIP) {
        const step = chapter.steps[event.index];
        if (step) callbacks.current.onStep(step.id);
      }
      if (
        event.type === EVENTS.ERROR ||
        event.type === EVENTS.TARGET_NOT_FOUND ||
        event.type === EVENTS.TOUR_END
      ) {
        ended.current = true;
        for (const controller of pending.current) controller.abort();
        callbacks.current.onEnd(
          event.type !== EVENTS.TOUR_END
            ? "failed"
            : event.status === STATUS.FINISHED
              ? "completed"
              : "skipped",
          chapter.steps[event.index]?.id,
        );
      }
    },
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      callbacks.current.onExit();
    }
    const onHistory = () => callbacks.current.onExit();
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("popstate", onHistory);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("popstate", onHistory);
    };
  }, []);
  return (
    <RuntimeContext.Provider
      value={{ chapter: chapterId, mode, onExit, onPrevious }}
    >
      {Tour}
      {state.waiting && (
        <Button
          variant="secondary"
          size="sm"
          className="fixed right-4 bottom-4"
          style={{ zIndex: OVERLAY_LAYERS.tour + 1 }}
          data-studio-tour="true"
          onClick={onExit}
        >
          Exit tour
        </Button>
      )}
    </RuntimeContext.Provider>
  );
}
