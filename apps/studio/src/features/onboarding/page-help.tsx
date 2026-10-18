"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EVENTS,
  STATUS,
  type Step,
  type TooltipRenderProps,
  useJoyride,
} from "react-joyride";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { OVERLAY_LAYERS } from "@/lib/overlay-layers";
import { usePathname, useSearchParams } from "@/lib/scoped-navigation";
import { studioFeature } from "@/usage/client";
import {
  createPageHelpPlan,
  type PageHelpPlan,
  type PageHelpStepId,
} from "./page-help-plan";
import { PAGE_DOCUMENTATION, type PageGuideId } from "./page-help-registry";
import { prepareLessonTarget } from "./targets";
import {
  GUIDE_FLOATING_OPTIONS,
  GuideTooltip,
  LearningArrow,
} from "./tour-presentation";
import { waitForTourTarget } from "./wait-for-target";

export interface PageHelpProps {
  sample: boolean;
  available: boolean;
  visible: boolean;
  onClose(): void;
  onExample(id: PageGuideId): void;
}
type HelpAction =
  | "start"
  | "step"
  | "complete"
  | "skip"
  | "exit"
  | "error"
  | "example_request"
  | "example_accept"
  | "example_cancel";
export function trackPageHelp(
  action: HelpAction,
  page: PageGuideId,
  sample: boolean,
  step?: PageHelpStepId,
) {
  studioFeature("studio.help", {
    help_action: action,
    help_page: page,
    help_context: sample ? "sample" : "real",
    ...(step ? { help_step: step } : {}),
  });
}

/** This flow never navigates or writes. Only the confirmed example action can transfer. */
export function PageHelp(props: PageHelpProps) {
  const [plan, setPlan] = useState<PageHelpPlan | null>(null);
  useEffect(() => {
    // Read visible DOM/layout after commit, never during React rendering.
    setPlan(createPageHelpPlan(new URL(window.location.href)));
  }, []);
  return plan ? <PageHelpFlow {...props} plan={plan} /> : null;
}

function PageHelpFlow(props: PageHelpProps & { plan: PageHelpPlan }) {
  const { plan } = props;
  const [choice, setChoice] = useState(
    plan.empty && props.available && !props.sample,
  );
  const [failed, setFailed] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [initialLocation] = useState(`${pathname}?${search}`);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    if (
      `${pathname}?${search}` !== initialLocation ||
      window.location.href !== plan.url
    )
      latest.current.onClose();
  }, [pathname, search, initialLocation, plan.url]);
  useEffect(() => {
    if (choice) trackPageHelp("example_request", plan.id, props.sample);
  }, [choice, plan.id, props.sample]);
  if (choice || failed || plan.steps.length === 0)
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) {
            if (choice) trackPageHelp("example_cancel", plan.id, props.sample);
            props.onClose();
          }
        }}
      >
        <DialogContent>
          <DialogTitle>
            {failed
              ? "This page changed"
              : choice
                ? "No records are visible here"
                : plan.title}
          </DialogTitle>
          <DialogDescription>
            {failed
              ? "The highlighted content is no longer available. You can restart the explanation for the current view."
              : choice
                ? "You can explain this page's controls here, or switch to a read-only sample example. Filters, permissions, or connection issues may also explain why no records are visible."
                : "This view is still loading. Close this message and choose Explain this page again once it is ready."}
          </DialogDescription>
          {choice && !props.visible && (
            <p className="text-sm text-muted-foreground">
              Opening the example will also show the sample project in your
              project selector.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (choice)
                  trackPageHelp("example_cancel", plan.id, props.sample);
                props.onClose();
              }}
            >
              Cancel
            </Button>
            {choice && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    trackPageHelp("example_accept", plan.id, props.sample);
                    props.onExample(plan.id);
                  }}
                >
                  Open sample example
                </Button>
                <Button
                  onClick={() => {
                    trackPageHelp("example_cancel", plan.id, props.sample);
                    setChoice(false);
                  }}
                >
                  Explain this page
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  return (
    <PageHelpRuntime
      plan={plan}
      sample={props.sample}
      onClose={props.onClose}
      onFailure={() => setFailed(true)}
    />
  );
}

const PageTooltipContext = createContext<{
  label: string;
  documentationUrl: string;
  onExit(): void;
} | null>(null);
function PageTooltip(props: TooltipRenderProps) {
  const context = useContext(PageTooltipContext);
  return context ? (
    <GuideTooltip
      {...props}
      label={context.label}
      onExit={context.onExit}
      documentationUrl={context.documentationUrl}
    />
  ) : null;
}

function PageHelpRuntime({
  plan,
  sample,
  onClose,
  onFailure,
}: {
  plan: PageHelpPlan;
  sample: boolean;
  onClose(): void;
  onFailure(): void;
}) {
  const pending = useRef(new Set<AbortController>());
  const ended = useRef(false);
  const callbacks = useRef({ onClose, onFailure });
  callbacks.current = { onClose, onFailure };
  function exit() {
    if (ended.current) return;
    ended.current = true;
    trackPageHelp("exit", plan.id, sample);
    callbacks.current.onClose();
  }
  const steps = useMemo<Step[]>(
    () =>
      plan.steps.map((step) => ({
        id: step.id,
        title: step.title,
        content: step.content,
        target: () => (step.target.isConnected ? step.target : null),
        placement: "bottom-start",
        skipScroll: true,
        before: async () => {
          const controller = new AbortController();
          pending.current.add(controller);
          try {
            await waitForTourTarget(
              () =>
                window.location.href === plan.url &&
                step.target.isConnected &&
                prepareLessonTarget(step.target),
              controller.signal,
            );
          } finally {
            pending.current.delete(controller);
          }
        },
      })),
    [plan],
  );
  const { Tour } = useJoyride({
    steps,
    run: true,
    continuous: true,
    scrollToFirstStep: true,
    tooltipComponent: PageTooltip,
    arrowComponent: LearningArrow,
    floatingOptions: GUIDE_FLOATING_OPTIONS,
    locale: { last: "Done", skip: "Skip" },
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
      if (event.type === EVENTS.TOUR_START)
        trackPageHelp("start", plan.id, sample);
      if (event.type === EVENTS.TOOLTIP)
        trackPageHelp("step", plan.id, sample, plan.steps[event.index]?.id);
      if (
        event.type === EVENTS.ERROR ||
        event.type === EVENTS.TARGET_NOT_FOUND ||
        event.type === EVENTS.TOUR_END
      ) {
        ended.current = true;
        for (const controller of pending.current) controller.abort();
        const failed = event.type !== EVENTS.TOUR_END;
        trackPageHelp(
          failed
            ? "error"
            : event.status === STATUS.FINISHED
              ? "complete"
              : "skip",
          plan.id,
          sample,
        );
        if (failed) callbacks.current.onFailure();
        else callbacks.current.onClose();
      }
    },
  });
  useEffect(() => {
    const controllers = pending.current;
    const onHistory = () => callbacks.current.onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        trackPageHelp("exit", plan.id, sample);
        callbacks.current.onClose();
      }
    };
    window.addEventListener("popstate", onHistory);
    document.addEventListener("keydown", onKey, true);
    return () => {
      for (const controller of controllers) controller.abort();
      window.removeEventListener("popstate", onHistory);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [plan.id, sample]);
  return (
    <PageTooltipContext.Provider
      value={{
        label: plan.title,
        onExit: exit,
        documentationUrl: PAGE_DOCUMENTATION[plan.id].documentationUrl,
      }}
    >
      {Tour}
    </PageTooltipContext.Provider>
  );
}
