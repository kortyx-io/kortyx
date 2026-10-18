"use client";

import { BookOpen, ChevronDown, CircleHelp, Compass } from "lucide-react";
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OVERLAY_LAYERS } from "@/lib/overlay-layers";
import { useRouter } from "@/lib/scoped-navigation";
import type { StudioLearningGuide } from "@/lib/studio-learning-guides";
import { studioFeature } from "@/usage/client";
import type { HubProps } from "./hub";
import { prepareSamplePage, prepareSampleTour } from "./navigation";
import type { PageHelpProps } from "./page-help";
import type { PageGuideId } from "./page-help-registry";
import {
  checkpoint,
  emptyProgress,
  entryIntent,
  finishChapter,
  type LearningProgress,
  nextChapter,
  previousChapter,
  readProgress,
  reviewChapter,
  startChapter,
  type TourEntryAction,
  writeProgress,
} from "./progress";
import {
  CHAPTERS,
  type ChapterId,
  chapterById,
  FULL_TOUR,
  type TourMode,
} from "./registry";
import type { RuntimeProps } from "./runtime";

type Screen = "idle" | "loading" | "hub" | "tour" | "break" | "summary";
type Summary = {
  chapter: ChapterId;
  mode: TourMode;
  completed: number;
  skipped: number;
  outcome: "completed" | "skipped";
};
interface LearningContextValue {
  openHub(): void;
  start(id: ChapterId): void;
  explain(): void;
  active: boolean;
  sample: boolean;
  visible: boolean;
  available: boolean;
}
const LearningContext = createContext<LearningContextValue | null>(null);
export const useLearning = () => useContext(LearningContext);
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function LearningProvider({
  children,
  sample,
  visible,
  available,
  returnTo,
  setupHref,
  guides = [],
}: {
  children: ReactNode;
  sample: boolean;
  visible: boolean;
  available: boolean;
  returnTo: string;
  setupHref?: string;
  guides?: readonly StudioLearningGuide[];
}) {
  const [progress, setProgress] = useState<LearningProgress>(emptyProgress);
  const current = useRef(progress);
  const [screen, setScreen] = useState<Screen>("idle");
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [Runtime, setRuntime] = useState<ComponentType<RuntimeProps>>();
  const [Hub, setHub] = useState<ComponentType<HubProps>>();
  const [PageHelp, setPageHelp] = useState<ComponentType<PageHelpProps>>();
  const [pageHelpOpen, setPageHelpOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const mounted = useRef(false);
  const intentConsumed = useRef(false);
  const busy = useRef(false);
  const loadTicket = useRef(0);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const transferAbort = useRef<AbortController | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const router = useRouter();
  const opener = useRef<HTMLElement | null>(null);

  function update(next: LearningProgress) {
    current.current = next;
    setProgress(next);
    setStorageAvailable(writeProgress(next, browserStorage()));
  }
  function track(
    action: string,
    resume = current.current.resume,
    step?: string,
    failure?: "load" | "target" | "entry",
  ) {
    studioFeature("studio.sample", {
      sample_action: action,
      ...(failure ? { tour_failure: failure } : {}),
      ...(resume
        ? {
            tour_chapter: resume.chapter,
            tour_mode: resume.mode,
            tour_version: String(chapterById(resume.chapter).version),
            ...(step &&
            chapterById(resume.chapter).steps.some((item) => item.id === step)
              ? { tour_step: step }
              : {}),
          }
        : {}),
    });
  }
  async function ensureHub() {
    const { LearningHub } = await import("./hub");
    if (mounted.current) setHub(() => LearningHub);
  }
  function focusLauncher() {
    requestAnimationFrame(() => {
      const target =
        opener.current?.isConnected &&
        opener.current.matches(
          'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        )
          ? opener.current
          : document.querySelector<HTMLElement>(
              '[data-learning-launcher="true"]',
            );
      target?.focus();
    });
  }
  function cancelLoading() {
    loadTicket.current += 1;
    transferAbort.current?.abort();
    busy.current = false;
    setLoading(false);
    setScreen("idle");
    focusLauncher();
  }
  async function openHub() {
    if (screenRef.current === "tour" || busy.current || pageHelpOpen) return;
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const ticket = ++loadTicket.current;
    setLoading(true);
    setScreen("loading");
    setError("");
    try {
      await ensureHub();
      if (mounted.current && ticket === loadTicket.current) {
        setScreen("hub");
        track("tour_hub");
      }
    } catch {
      if (mounted.current && ticket === loadTicket.current) {
        setError("Could not load Studio guides. Please try again.");
        setScreen("idle");
      }
    } finally {
      if (mounted.current && ticket === loadTicket.current) setLoading(false);
    }
  }
  async function explain() {
    if (screenRef.current === "tour" || busy.current || pageHelpOpen) return;
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const ticket = ++loadTicket.current;
    setLoading(true);
    setScreen("loading");
    setError("");
    try {
      const { PageHelp } = await import("./page-help");
      if (!mounted.current || ticket !== loadTicket.current) return;
      setPageHelp(() => PageHelp);
      setPageHelpOpen(true);
      setScreen("idle");
    } catch {
      if (mounted.current && ticket === loadTicket.current) {
        setError("Could not load this page's guide. Please try again.");
        setScreen("idle");
      }
    } finally {
      if (mounted.current && ticket === loadTicket.current) setLoading(false);
    }
  }
  async function openSamplePage(page: PageGuideId) {
    if (busy.current) return;
    busy.current = true;
    const ticket = ++loadTicket.current;
    const controller = new AbortController();
    transferAbort.current = controller;
    setPageHelpOpen(false);
    setLoading(true);
    setScreen("loading");
    try {
      if (!available) throw new Error();
      const prepared = await prepareSamplePage({
        page,
        visible,
        returnTo,
        signal: controller.signal,
      });
      if (!mounted.current || ticket !== loadTicket.current) return;
      if (prepared.shown) track("show", null);
      window.location.assign(prepared.href);
    } catch {
      if (
        mounted.current &&
        ticket === loadTicket.current &&
        !controller.signal.aborted
      ) {
        setLoading(false);
        setScreen("idle");
        setError(
          "Could not open the sample example. Your current project is unchanged. Please try again.",
        );
        focusLauncher();
      }
    } finally {
      if (ticket === loadTicket.current) busy.current = false;
      if (transferAbort.current === controller) transferAbort.current = null;
    }
  }
  async function play() {
    if (busy.current) return;
    busy.current = true;
    const ticket = ++loadTicket.current;
    setLoading(true);
    setScreen("loading");
    setError("");
    try {
      const [{ LearningRuntime }, { LearningHub }] = await Promise.all([
        import("./runtime"),
        import("./hub"),
      ]);
      if (!mounted.current || ticket !== loadTicket.current) return;
      setRuntime(() => LearningRuntime);
      setHub(() => LearningHub);
      setGeneration((value) => value + 1);
      setScreen("tour");
    } catch {
      if (mounted.current && ticket === loadTicket.current) {
        setError(
          "The tour could not load. Your place is saved; try Resume tour.",
        );
        track("tour_error", current.current.resume, undefined, "load");
        try {
          await ensureHub();
          if (ticket === loadTicket.current) setScreen("hub");
        } catch {
          if (ticket === loadTicket.current) setScreen("idle");
        }
      }
    } finally {
      if (ticket === loadTicket.current) {
        busy.current = false;
        if (mounted.current) setLoading(false);
      }
    }
  }
  async function transfer(action: TourEntryAction, chapter: ChapterId) {
    const ticket = ++loadTicket.current;
    const controller = new AbortController();
    transferAbort.current = controller;
    setLoading(true);
    setScreen("loading");
    setError("");
    try {
      if (!available) throw new Error();
      await ensureHub();
      if (!mounted.current || ticket !== loadTicket.current) return;
      const prepared = await prepareSampleTour({
        action,
        chapter,
        visible,
        returnTo,
        signal: controller.signal,
      });
      if (!mounted.current || ticket !== loadTicket.current) return;
      if (prepared.shown) track("show");
      window.location.assign(prepared.href);
    } catch {
      if (
        mounted.current &&
        ticket === loadTicket.current &&
        !controller.signal.aborted
      ) {
        track("tour_error", null, undefined, "entry");
        setError("Could not open the sample project. Please try again.");
        setScreen("hub");
        setLoading(false);
      }
    } finally {
      if (transferAbort.current === controller) transferAbort.current = null;
    }
  }
  async function start(
    id: ChapterId,
    mode: TourMode = "chapter",
    resumeChapter = false,
  ) {
    if (pageHelpOpen) return;
    if (!sample)
      return transfer(
        mode === "full" ? "full" : resumeChapter ? "resume-chapter" : "chapter",
        id,
      );
    const saved = current.current.chapters[id];
    let next = startChapter(current.current, id, mode);
    if (
      resumeChapter &&
      saved?.status === "in-progress" &&
      saved.version === chapterById(id).version
    )
      next = checkpoint(next, saved.step);
    update(next);
    await play();
  }
  async function resume() {
    if (!sample) return transfer("resume", CHAPTERS[0].id);
    const point = current.current.resume;
    if (!point) return;
    track("tour_resume");
    if (point.phase === "break") {
      await ensureHub();
      setScreen("break");
    } else await play();
  }
  function exit() {
    track("tour_exit");
    setScreen("idle");
    focusLauncher();
  }
  function end(
    outcome: "completed" | "skipped" | "failed",
    failedStep?: string,
  ) {
    const point = current.current.resume;
    if (!point) return;
    if (outcome === "failed") {
      track("tour_error", point, failedStep, "target");
      setError(
        "The tour could not find its next step. Your place is saved. Resume to try again, or restart the chapter.",
      );
      setScreen("hub");
      return;
    }
    track(outcome === "completed" ? "tour_complete" : "tour_skip");
    const next = finishChapter(current.current, outcome);
    const finished = next.resume;
    if (!finished) return;
    if (point.mode === "full" && nextChapter(next).resume) {
      update(next);
      setScreen("break");
    } else {
      if (point.mode === "full")
        track(
          FULL_TOUR.every((id) => finished.completed.includes(id))
            ? "tour_full_complete"
            : "tour_full_partial",
        );
      setSummary({
        chapter: point.chapter,
        mode: point.mode,
        completed: finished.completed.length,
        skipped: finished.skipped.length,
        outcome,
      });
      update({ ...next, resume: null });
      setScreen("summary");
    }
  }
  async function continueTour() {
    const next = nextChapter(current.current);
    update(next);
    if (next.resume) await play();
  }
  async function review() {
    update(reviewChapter(current.current));
    await play();
  }
  async function previous() {
    update(previousChapter(current.current));
    await play();
  }

  const bootstrap = useEffectEvent(() => {
    const saved = readProgress(browserStorage());
    update(saved);
    if (sample && !intentConsumed.current) {
      intentConsumed.current = true;
      if (new URLSearchParams(window.location.search).get("explain") === "1") {
        const params = new URLSearchParams(window.location.search);
        params.delete("explain");
        const destination = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
        window.history.replaceState(window.history.state, "", destination);
        void explain();
        return;
      }
      const intent = entryIntent(window.location.search);
      if (intent) {
        const params = new URLSearchParams(window.location.search);
        params.delete("learn");
        params.delete("chapter");
        const destination = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
        router.replace(destination, { scroll: false });
        if (intent.action === "resume" && saved.resume) void resume();
        else if (intent.action === "full") {
          track("tour_full_start");
          void start(CHAPTERS[0].id, "full");
        } else if (
          intent.action === "chapter" ||
          intent.action === "resume-chapter"
        )
          void start(
            intent.chapter,
            "chapter",
            intent.action === "resume-chapter",
          );
        else void openHub();
      }
    }
  });
  useEffect(() => {
    mounted.current = true;
    bootstrap();
    return () => {
      mounted.current = false;
      transferAbort.current?.abort();
    };
  }, []);

  const cancelPending = useEffectEvent(cancelLoading);
  useEffect(() => {
    if (!loading) return;
    cancelButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelPending();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [loading]);
  const point = progress.resume;
  return (
    <LearningContext.Provider
      value={{
        openHub,
        explain: () => {
          void explain();
        },
        start: (id) => {
          void start(id);
        },
        active: screen === "tour" || loading || pageHelpOpen,
        sample,
        visible,
        available,
      }}
    >
      {children}
      {PageHelp && pageHelpOpen && (
        <PageHelp
          sample={sample}
          available={available}
          visible={visible}
          onClose={() => {
            setPageHelpOpen(false);
            focusLauncher();
          }}
          onExample={(page) => {
            void openSamplePage(page);
          }}
        />
      )}
      {loading && (
        <output
          className="fixed right-4 bottom-4 rounded-md border bg-popover p-3 text-sm text-popover-foreground"
          style={{ zIndex: OVERLAY_LAYERS.tour }}
        >
          Loading Studio guides…
          <Button
            variant="ghost"
            size="sm"
            className="ml-2"
            ref={cancelButton}
            onClick={cancelLoading}
          >
            Cancel
          </Button>
        </output>
      )}
      {error && screen === "idle" && (
        <p
          role="alert"
          className="fixed right-4 bottom-4 max-w-sm rounded-md border bg-popover p-3 text-sm"
          style={{ zIndex: OVERLAY_LAYERS.popover }}
        >
          {error}
        </p>
      )}
      {Hub && (
        <Hub
          open={screen === "hub" || screen === "break" || screen === "summary"}
          progress={progress}
          stage={
            screen === "break"
              ? "break"
              : screen === "summary"
                ? "summary"
                : "hub"
          }
          summary={summary}
          sample={sample}
          visible={visible}
          available={available}
          loading={loading}
          storageAvailable={storageAvailable}
          error={error}
          guides={guides}
          setupHref={setupHref}
          onClose={() => {
            setScreen("idle");
            focusLauncher();
          }}
          onStart={(id, resumeChapter) => {
            void start(id, "chapter", resumeChapter);
          }}
          onFull={() => {
            if (sample) track("tour_full_start", null);
            void start(CHAPTERS[0].id, "full");
          }}
          onResume={() => {
            void resume();
          }}
          onContinue={() => {
            void continueTour();
          }}
          onReview={() => {
            void review();
          }}
          onReset={() => {
            update(emptyProgress());
            setSummary(null);
            setError("");
            track("tour_reset", null);
            setScreen("hub");
          }}
          onHome={() => setScreen("hub")}
        />
      )}
      {screen === "tour" && point && Runtime && (
        <Runtime
          key={generation}
          chapter={point.chapter}
          mode={point.mode}
          initialStep={point.step}
          onStep={(id) => {
            update(checkpoint(current.current, id));
            track("tour_step", current.current.resume, id);
          }}
          onEnd={end}
          onExit={exit}
          onPrevious={() => {
            void previous();
          }}
          onStart={() => track("tour_start")}
        />
      )}
    </LearningContext.Provider>
  );
}

export function LearningControls() {
  const learning = useLearning();
  if (!learning) return null;
  return (
    <div
      className="relative flex shrink-0 items-center gap-1"
      style={{ zIndex: OVERLAY_LAYERS.popover }}
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="xs"
            data-learning-launcher="true"
            disabled={learning.active}
          >
            <Compass data-icon="inline-start" />
            Explore
            <ChevronDown data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={() => requestAnimationFrame(learning.openHub)}
            >
              <Compass />
              Explore Studio
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => requestAnimationFrame(learning.explain)}
            >
              <CircleHelp />
              <span className="flex flex-col gap-0.5">
                <span>Explain this page</span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <a href="https://kortyx.io/docs" target="_blank" rel="noreferrer">
                <BookOpen />
                Documentation
              </a>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
