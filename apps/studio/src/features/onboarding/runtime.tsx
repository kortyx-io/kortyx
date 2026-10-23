"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import {
  EVENTS,
  STATUS,
  type Step,
  type TooltipRenderProps,
  useJoyride,
} from "react-joyride";
import { Button } from "@/components/ui/button";
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
import {
  GUIDE_FLOATING_OPTIONS,
  GuideTooltip,
  LearningArrow,
} from "./tour-presentation";
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

function LearningTooltip(props: TooltipRenderProps) {
  const context = useContext(RuntimeContext);
  if (!context) return null;
  const chapterIndex = FULL_TOUR.indexOf(context.chapter);
  return (
    <GuideTooltip
      {...props}
      label={chapterById(context.chapter).title}
      onExit={context.onExit}
      onPrevious={
        context.mode === "full" && chapterIndex > 0
          ? context.onPrevious
          : undefined
      }
      skipLabel={context.mode === "full" ? "Skip chapter" : "Skip"}
      footer={
        context.mode === "full" ? (
          <span>
            Chapter {chapterIndex + 1} of {FULL_TOUR.length}
          </span>
        ) : undefined
      }
    />
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
          skipScroll: true,
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
    floatingOptions: GUIDE_FLOATING_OPTIONS,
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
      <div data-studio-tour="true" className="contents">
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
      </div>
    </RuntimeContext.Provider>
  );
}
