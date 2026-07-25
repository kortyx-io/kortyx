"use client";

import { Maximize2, X } from "lucide-react";
import { parseAsStringLiteral } from "nuqs";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DETAIL_MOTION_DURATION_MS } from "@/components/detail/detail-motion";
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

type DetailDrawerRegistration = {
  children: ReactNode;
  description: string;
  dismissPath: string;
  markSlotEntered: () => void;
  matchPath: string;
  slotEntered: boolean;
  title: string;
};

type HostedDetailDrawer = DetailDrawerRegistration & {
  active: boolean;
};

type DetailDrawerHostContextValue = {
  register: (drawer: DetailDrawerRegistration) => () => void;
};

const DetailDrawerHostContext =
  createContext<DetailDrawerHostContextValue | null>(null);

export const useDetailDrawer = () => useContext(DetailDrawerContext);

export function DetailDrawerHost({ children }: { children: ReactNode }) {
  const [drawers, setDrawers] = useState<HostedDetailDrawer[]>([]);
  const registrationCountsRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, number>());

  const clearTimer = useCallback((key: string) => {
    const timer = timersRef.current.get(key);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timersRef.current.delete(key);
  }, []);

  const register = useCallback(
    (drawer: DetailDrawerRegistration) => {
      const id = drawer.matchPath;
      registrationCountsRef.current.set(
        id,
        (registrationCountsRef.current.get(id) ?? 0) + 1,
      );
      clearTimer(`deactivate:${id}`);
      clearTimer(`remove:${id}`);
      setDrawers((current) => {
        const existing = current.find(
          (candidate) => candidate.matchPath === id,
        );
        if (!existing) return [...current, { ...drawer, active: true }];
        return current.map((candidate) =>
          candidate.matchPath === id
            ? { ...candidate, ...drawer, active: true }
            : candidate,
        );
      });

      return () => {
        const remaining = Math.max(
          0,
          (registrationCountsRef.current.get(id) ?? 1) - 1,
        );
        if (remaining > 0) {
          registrationCountsRef.current.set(id, remaining);
          return;
        }
        registrationCountsRef.current.delete(id);
        clearTimer(`deactivate:${id}`);
        const deactivateTimer = window.setTimeout(() => {
          timersRef.current.delete(`deactivate:${id}`);
          if ((registrationCountsRef.current.get(id) ?? 0) > 0) return;
          setDrawers((current) =>
            current.map((candidate) =>
              candidate.matchPath === id
                ? { ...candidate, active: false }
                : candidate,
            ),
          );
          const removeTimer = window.setTimeout(() => {
            timersRef.current.delete(`remove:${id}`);
            if ((registrationCountsRef.current.get(id) ?? 0) > 0) return;
            setDrawers((current) =>
              current.filter((candidate) => candidate.matchPath !== id),
            );
          }, DETAIL_MOTION_DURATION_MS);
          timersRef.current.set(`remove:${id}`, removeTimer);
        }, 0);
        timersRef.current.set(`deactivate:${id}`, deactivateTimer);
      };
    },
    [clearTimer],
  );

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
      registrationCountsRef.current.clear();
    },
    [],
  );

  const value = useMemo(() => ({ register }), [register]);

  return (
    <DetailDrawerHostContext.Provider value={value}>
      {children}
      {drawers.map((drawer) => (
        <DetailDrawerSurface key={drawer.matchPath} {...drawer} />
      ))}
    </DetailDrawerHostContext.Provider>
  );
}

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
  const host = useContext(DetailDrawerHostContext);
  const slotMotion = useDetailSlotMotion();
  if (!host) {
    throw new Error("Detail drawers must be rendered inside DetailDrawerHost");
  }

  useLayoutEffect(
    () =>
      host.register({
        children,
        description,
        dismissPath,
        markSlotEntered: slotMotion.markEntered,
        matchPath,
        slotEntered: slotMotion.entered,
        title,
      }),
    [
      children,
      description,
      dismissPath,
      host.register,
      matchPath,
      slotMotion.entered,
      slotMotion.markEntered,
      title,
    ],
  );

  return null;
}

function DetailDrawerSurface({
  active,
  matchPath,
  dismissPath,
  title,
  description,
  children,
  slotEntered,
  markSlotEntered,
}: HostedDetailDrawer) {
  const { state, isMobile } = useSidebar();
  const [{ detailView }, setDetailView] = useStudioQueryStates(
    detailViewParsers,
    { shallow: true },
  );
  const nestedInspector = useNestedInspectorState();
  const [entered, setEntered] = useState(slotEntered);
  const [localClosing, setLocalClosing] = useState(false);
  const layer = useDetailStackLayer({
    dismissPath,
    id: matchPath,
    matchPath,
  });
  const expandedRequested = detailView === "expanded";
  const expanded = expandedRequested || layer.expanded;
  const expandedView = expanded && !isMobile;
  const closing = localClosing || layer.closing || !active;
  const titleId = `detail-drawer-title-${matchPath.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;

  const closeDrawer = useCallback(() => {
    if (closing || !layer.isTop) return;
    setLocalClosing(true);
    layer.closeTop();
  }, [closing, layer]);

  useEffect(() => {
    if (!active || !layer.isTop) return;
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
    active,
  ]);

  useEffect(() => {
    if (expandedRequested) layer.expand();
  }, [expandedRequested, layer.expand]);

  useEffect(() => {
    layer.setSplitOpen(nestedInspector.nestedOpen);
    return () => layer.setSplitOpen(false);
  }, [layer.setSplitOpen, nestedInspector.nestedOpen]);

  useEffect(() => {
    if (active) {
      setLocalClosing(false);
      layer.reopen();
      if (slotEntered) {
        setEntered(true);
        return;
      }
      setEntered(false);
      let enterFrame = 0;
      const paintFrame = window.requestAnimationFrame(() => {
        enterFrame = window.requestAnimationFrame(() => {
          setEntered(true);
          markSlotEntered();
        });
      });
      return () => {
        window.cancelAnimationFrame(paintFrame);
        window.cancelAnimationFrame(enterFrame);
      };
    }

    nestedInspector.setNestedOpen(false);
    setLocalClosing(true);
    layer.beginClose();
  }, [
    layer.beginClose,
    layer.reopen,
    markSlotEntered,
    nestedInspector.setNestedOpen,
    active,
    slotEntered,
  ]);

  const sidebarOffset =
    state === "collapsed"
      ? "var(--sidebar-width-icon)"
      : "var(--sidebar-width)";
  const left = isMobile
    ? "1rem"
    : expanded
      ? `calc(${sidebarOffset} + ${layer.depthBelow * 3}rem)`
      : layer.splitActive
        ? `max(calc(${sidebarOffset} + ${layer.depthBelow * 3}rem), calc(100vw - ${73 - layer.depthBelow * 3}rem))`
        : `max(${sidebarOffset}, calc(100vw - ${33 + layer.depthAbove * 3}rem))`;

  return (
    <>
      {layer.isTop && (
        <button
          type="button"
          aria-label="Close detail"
          tabIndex={-1}
          onClick={closeDrawer}
          style={{ zIndex: layer.zIndex - 5 }}
          className={cn(
            "fixed inset-0 bg-overlay transition-opacity duration-300 ease-in-out",
            expandedView && layer.isBottom && "pointer-events-none opacity-0",
            (!entered || closing) && "pointer-events-none opacity-0",
          )}
        />
      )}
      <section
        data-detail-drawer
        data-entry-motion={slotEntered ? "preserve" : "enter"}
        data-state={closing ? "closed" : "open"}
        role="dialog"
        aria-modal={layer.isTop && !expandedView && !nestedInspector.nestedOpen}
        aria-labelledby={titleId}
        style={{ left, zIndex: layer.zIndex }}
        className={cn(
          "fixed top-12 right-4 bottom-4 flex min-w-0 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl transition-[left,translate] duration-300 ease-in-out",
          (!entered || closing) && "translate-x-[calc(100%_+_1rem)]",
        )}
      >
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
