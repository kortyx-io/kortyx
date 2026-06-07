"use client";

import { CircleCheck, FileText, Loader2, Wand2, XIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useDiscoveryCanvasStore } from "@/hooks/use-canvas-store";
import { BriefCard } from "./brief-card";
import { SaveDiscoveryCanvasButton } from "./canvas-button";
import { DiscoveryCanvasConfigStrip } from "./canvas-config-strip";
import { EditableText } from "./editable-text";
import { SectionCard } from "./section-card";

const DOT_PATTERN: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
  backgroundSize: "20px 20px",
};

/** Pixels from the bottom that still count as "stuck to bottom". */
const STICK_THRESHOLD_PX = 32;

function isNearBottom(node: HTMLDivElement): boolean {
  return (
    node.scrollHeight - node.scrollTop - node.clientHeight < STICK_THRESHOLD_PX
  );
}

export function Canvas() {
  const {
    draft,
    hasContent,
    isStreaming,
    isCanvasCreating,
    updateTitle,
    showCanvasInfoBanner,
    dismissCanvasInfoBanner,
  } = useDiscoveryCanvasStore();
  const points = draft.sections ?? {};
  const sectionEntries = Object.entries(points);
  const totalItems = sectionEntries.reduce(
    (sum, [, section]) => sum + Object.keys(section?.items ?? {}).length,
    0,
  );

  // Auto-scroll to bottom as new content streams in, but only while the
  // user is already at (or near) the bottom. Mirrors the chat messages
  // behavior — if the user scrolls up to read an earlier section, we
  // stop following the tail and don't yank them back.
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuckToBottomRef = useRef(false);
  const followCreateTailRef = useRef(false);

  const shouldFollowTail = useCallback(() => {
    return stuckToBottomRef.current || followCreateTailRef.current;
  }, []);

  const pinToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node || !shouldFollowTail()) return;
    node.scrollTop = node.scrollHeight;
  }, [shouldFollowTail]);

  useEffect(() => {
    if (isCanvasCreating) {
      followCreateTailRef.current = true;
    }
  }, [isCanvasCreating]);

  useEffect(() => {
    if (!isStreaming) {
      followCreateTailRef.current = false;
    }
  }, [isStreaming]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onScroll = () => {
      const nearBottom = isNearBottom(node);
      stuckToBottomRef.current = nearBottom;
      if (!nearBottom) {
        followCreateTailRef.current = false;
      }
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  // Follow the tail when content grows — only if the user is near the bottom
  // or a new canvas is streaming in.
  useEffect(() => {
    const scrollNode = scrollRef.current;
    const contentNode = contentRef.current;
    if (!scrollNode || !contentNode) return;
    const observer = new ResizeObserver(() => {
      pinToBottom();
    });
    observer.observe(contentNode);
    return () => observer.disconnect();
  }, [pinToBottom]);

  // During create-canvas, keep pinning every frame so textarea growth
  // between React commits doesn't fall behind.
  useEffect(() => {
    if (!isCanvasCreating) return;
    let rafId = 0;
    const tick = () => {
      pinToBottom();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isCanvasCreating, pinToBottom]);

  // Sync scroll after React commits DOM updates when tail-follow is active.
  // biome-ignore lint/correctness/useExhaustiveDependencies: depend on growth signals, not the whole draft object
  useLayoutEffect(() => {
    pinToBottom();
  }, [
    draft,
    sectionEntries.length,
    totalItems,
    showCanvasInfoBanner,
    pinToBottom,
  ]);

  return (
    <section
      aria-label="Canvas process canvas"
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-muted/30"
    >
      {!showCanvasInfoBanner ? null : (
        <CanvasInfoBanner onDismiss={dismissCanvasInfoBanner} />
      )}
      <div
        ref={scrollRef}
        className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto"
        style={DOT_PATTERN}
      >
        <div
          ref={contentRef}
          className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8"
        >
          <Header
            title={draft.title ?? ""}
            onTitleChange={updateTitle}
            sectionsCount={sectionEntries.length}
            totalItems={totalItems}
            isStreaming={isStreaming}
            hasContent={hasContent}
          />

          {hasContent ? <DiscoveryCanvasConfigStrip /> : null}

          {!hasContent ? (
            <EmptyState isStreaming={isStreaming} />
          ) : (
            <>
              {draft.intro ? <BriefCard /> : null}
              {sectionEntries.map(([sectionKey, section], index) => (
                <SectionCard
                  key={sectionKey}
                  index={index}
                  sectionKey={sectionKey}
                  section={section}
                />
              ))}
              <SaveDiscoveryCanvasButton />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function CanvasInfoBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Alert
      variant="success"
      className="w-full shrink-0 rounded-none border-x-0 border-t-0 px-4 py-2.5 pr-10 text-sm"
    >
      <CircleCheck />
      <AlertDescription className="text-sm leading-snug">
        Modify the text directly on the canvas, select text to ask about it in
        the chat, and save when you are ready.
      </AlertDescription>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss canvas tips"
        onClick={onDismiss}
        className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2 text-green-700 hover:bg-green-100 hover:text-green-900 dark:text-green-300 dark:hover:bg-green-900/50"
      >
        <XIcon className="size-3.5" />
      </Button>
    </Alert>
  );
}

function Header({
  title,
  onTitleChange,
  sectionsCount,
  totalItems,
  isStreaming,
  hasContent,
}: {
  title: string;
  onTitleChange: (next: string) => void;
  sectionsCount: number;
  totalItems: number;
  isStreaming: boolean;
  hasContent: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card/80 px-5 py-4 backdrop-blur transition-colors hover:border-primary/40">
      <div className="flex flex-1 items-start gap-3 min-w-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="size-4" />
        </div>
        <div className="flex flex-1 flex-col min-w-0">
          {hasContent ? (
            <EditableText
              value={title}
              onCommit={onTitleChange}
              variant="title"
              placeholder="Untitled discovery canvas"
              ariaLabel="Discovery canvas title"
            />
          ) : (
            <h2 className="text-sm font-semibold leading-tight text-card-foreground">
              Product discovery canvas
            </h2>
          )}
          <p className="text-xs text-muted-foreground">
            {hasContent
              ? `${sectionsCount} sections · ${totalItems} items`
              : "Generated content will appear here"}
          </p>
        </div>
      </div>
      {isStreaming ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          <Loader2 className="size-3 animate-spin" />
          Building…
        </span>
      ) : null}
    </header>
  );
}

function EmptyState({ isStreaming }: { isStreaming: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/40 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {isStreaming ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Wand2 className="size-5" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-card-foreground">
          {isStreaming
            ? "Generating your discovery canvas"
            : "No discovery canvas yet"}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {isStreaming
            ? "Hang tight — once the agent finishes, the product brief and discovery sections will appear here, ready to refine."
            : "Ask the agent to build a discovery canvas from a product idea or select one of the demo briefs."}
        </p>
      </div>
    </div>
  );
}
