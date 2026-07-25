"use client";

import { ChevronLeft, Maximize2, X } from "lucide-react";
import { parseAsStringLiteral } from "nuqs";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useDetailSlotMotion } from "@/components/detail/detail-slot-presence";
import { useDetailStackLayer } from "@/components/detail/detail-stack";
import { Button } from "@/components/ui/button";
import { OverflowText } from "@/components/ui/overflow-tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { useStudioQueryStates } from "@/lib/nuqs";
import { cn } from "@/lib/utils";

type DetailDrawerContextValue = {
  closing: boolean;
  isMobile: boolean;
  layerZIndex: number;
  nestedClosing: boolean;
  nestedOpen: boolean;
  presentation: "none" | "route" | "drawer";
  requestNestedClose: () => void;
  setNestedOpen: (open: boolean) => void;
  supportsSplitInspector: boolean;
};

const DetailDrawerContext = createContext<DetailDrawerContextValue>({
  closing: false,
  isMobile: false,
  layerZIndex: 50,
  nestedClosing: false,
  nestedOpen: false,
  presentation: "none",
  requestNestedClose: () => undefined,
  setNestedOpen: () => undefined,
  supportsSplitInspector: false,
});

const detailViewParsers = {
  detailView: parseAsStringLiteral(["drawer", "expanded"] as const).withDefault(
    "drawer",
  ),
};

export const useDetailDrawer = () => useContext(DetailDrawerContext);

export function DetailSurfaceProvider({ children }: { children: ReactNode }) {
  const { isMobile } = useSidebar();
  const nestedInspector = useNestedInspectorState();

  return (
    <DetailDrawerContext.Provider
      value={{
        closing: false,
        isMobile,
        layerZIndex: 50,
        presentation: "route",
        supportsSplitInspector: true,
        ...nestedInspector,
      }}
    >
      {children}
    </DetailDrawerContext.Provider>
  );
}

export function DetailDrawer({
  matchPath,
  dismissPath,
  title,
  description,
  children,
}: {
  matchPath: string;
  dismissPath: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { state, isMobile } = useSidebar();
  const [{ detailView }, setDetailView] = useStudioQueryStates(
    detailViewParsers,
    { shallow: true },
  );
  const nestedInspector = useNestedInspectorState();
  const slotMotion = useDetailSlotMotion();
  const [entered, setEntered] = useState(slotMotion.entered);
  const [localClosing, setLocalClosing] = useState(false);
  const layer = useDetailStackLayer({
    dismissPath,
    id: matchPath,
    matchPath,
  });
  const expandedRequested = detailView === "expanded";
  const expanded = expandedRequested || layer.expanded;
  const expandedView = expanded && !isMobile;
  const closing = localClosing || layer.closing || !slotMotion.active;
  const titleId = `detail-drawer-title-${matchPath.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;

  const closeDrawer = useCallback(() => {
    if (closing || !layer.isTop) return;
    setLocalClosing(true);
    layer.closeTop();
  }, [closing, layer]);

  useEffect(() => {
    if (!slotMotion.active || !layer.isTop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (nestedInspector.nestedOpen) return;
      if (event.key === "Escape") closeDrawer();
      if (event.key.toLowerCase() === "e" && !event.metaKey && !event.ctrlKey) {
        const target = event.target as HTMLElement | null;
        if (
          !expandedView &&
          !target?.matches("input, textarea, select, [contenteditable=true]")
        ) {
          layer.expand();
          void setDetailView(
            { detailView: "expanded" },
            { history: "replace" },
          );
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    closeDrawer,
    expandedView,
    layer.expand,
    layer.isTop,
    nestedInspector.nestedOpen,
    setDetailView,
    slotMotion.active,
  ]);

  useEffect(() => {
    if (expandedRequested) layer.expand();
  }, [expandedRequested, layer.expand]);

  useEffect(() => {
    layer.setSplitOpen(nestedInspector.nestedOpen);
    return () => layer.setSplitOpen(false);
  }, [layer.setSplitOpen, nestedInspector.nestedOpen]);

  useEffect(() => {
    if (slotMotion.active) {
      setLocalClosing(false);
      layer.reopen();
      if (slotMotion.entered) {
        setEntered(true);
        return;
      }
      setEntered(false);
      const frame = window.requestAnimationFrame(() => {
        setEntered(true);
        slotMotion.markEntered();
      });
      return () => window.cancelAnimationFrame(frame);
    }

    nestedInspector.setNestedOpen(false);
    setLocalClosing(true);
    layer.beginClose();
  }, [
    layer.beginClose,
    layer.reopen,
    nestedInspector.setNestedOpen,
    slotMotion.active,
    slotMotion.entered,
    slotMotion.markEntered,
  ]);

  const sidebarOffset =
    state === "collapsed"
      ? "var(--sidebar-width-icon)"
      : "var(--sidebar-width)";
  const left = isMobile
    ? "1rem"
    : expanded
      ? sidebarOffset
      : layer.splitActive
        ? `max(${sidebarOffset}, calc(100vw - 73rem))`
        : `max(${sidebarOffset}, calc(100vw - ${33 + layer.depthAbove * 3}rem))`;

  return (
    <>
      {layer.isBottom && (
        <button
          type="button"
          aria-label="Close all details"
          tabIndex={-1}
          onClick={layer.closeAll}
          className={cn(
            "fixed inset-0 z-40 bg-overlay transition-opacity duration-300 ease-in-out",
            expandedView && layer.isTop && "pointer-events-none opacity-0",
            (!entered || closing) && "pointer-events-none opacity-0",
          )}
        />
      )}
      <section
        role="dialog"
        aria-modal={layer.isTop && !expandedView && !nestedInspector.nestedOpen}
        aria-labelledby={titleId}
        style={{ left, zIndex: layer.zIndex }}
        className={cn(
          "fixed top-12 right-4 bottom-4 flex min-w-0 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl transition-[left,translate] duration-300 ease-in-out",
          (!entered || closing) && "translate-x-[calc(100%_+_1rem)]",
        )}
      >
        {!layer.isTop && (
          <button
            type="button"
            aria-label={`Return to ${title}`}
            title={`Return to ${title}`}
            onClick={layer.closeAbove}
            className="absolute inset-y-0 left-0 z-20 flex w-12 items-start justify-center border-r bg-background/95 pt-[1.15rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          {layer.isTop && !isMobile && !expandedView && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Expand detail"
              onClick={() => {
                layer.expand();
                void setDetailView(
                  { detailView: "expanded" },
                  { history: "replace" },
                );
              }}
            >
              <Maximize2 />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h1
              id={titleId}
              tabIndex={-1}
              aria-label={title}
              className="min-w-0 text-sm font-semibold outline-none"
            >
              <OverflowText ariaLabel={title}>{title}</OverflowText>
            </h1>
            <p className="min-w-0 text-xs text-muted-foreground">
              <OverflowText ariaLabel={description}>{description}</OverflowText>
            </p>
          </div>
          {layer.isTop && !expandedView && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close detail"
              onClick={closeDrawer}
            >
              <X />
            </Button>
          )}
        </header>
        <DetailDrawerContext.Provider
          value={{
            closing,
            isMobile,
            layerZIndex: layer.zIndex,
            presentation: "drawer",
            supportsSplitInspector: true,
            ...nestedInspector,
          }}
        >
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </DetailDrawerContext.Provider>
      </section>
    </>
  );
}

function useNestedInspectorState() {
  const [nestedOpen, setNestedOpenState] = useState(false);
  const [nestedClosing, setNestedClosing] = useState(false);
  const setNestedOpen = useCallback((open: boolean) => {
    setNestedOpenState(open);
    if (!open) setNestedClosing(false);
  }, []);
  const requestNestedClose = useCallback(() => {
    setNestedClosing(true);
    setNestedOpenState(false);
  }, []);

  return {
    nestedClosing,
    nestedOpen,
    requestNestedClose,
    setNestedOpen,
  };
}
