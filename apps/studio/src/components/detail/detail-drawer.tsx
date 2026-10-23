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
import {
  useDetailStackLayer,
  useRetainedDetailLayers,
} from "@/components/detail/detail-stack";
import { Button } from "@/components/ui/button";
import { OverflowText } from "@/components/ui/overflow-tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { useStudioQueryStates } from "@/lib/nuqs";
import { OVERLAY_LAYERS } from "@/lib/overlay-layers";
import { usePathname } from "@/lib/scoped-navigation";
import { studioPathname } from "@/lib/studio-routing";
import { cn } from "@/lib/utils";

type DetailDrawerContextValue = {
  navigation?: {
    expanded: boolean;
    canExpand: boolean;
    isTop: boolean;
    close: () => void;
    expand: () => void;
  };
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
  layerZIndex: OVERLAY_LAYERS.detailDrawerBase,
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
  customHeader?: boolean;
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
  const pathname = usePathname();
  const [drawers, setDrawers] = useState<HostedDetailDrawer[]>([]);
  const layers = useRetainedDetailLayers();
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
      {drawers.map((drawer) => {
        const layer = layers.find((layer) => layer.id === drawer.matchPath);
        const retained =
          layers.findLast(
            (layer) =>
              layer.dismissPath === drawer.dismissPath && !layer.closing,
          )?.id === drawer.matchPath;
        // Next can discard a parallel slot while an ancestor is covered, or
        // restore an empty slot on Forward. Keep its last server payload for
        // this workspace's history, but mount it only while present or exiting.
        return (
          <RetainedDetailDrawer
            key={drawer.matchPath}
            {...drawer}
            active={
              retained ||
              (drawer.active &&
                !layer?.closing &&
                pathname === drawer.matchPath)
            }
          />
        );
      })}
    </DetailDrawerHostContext.Provider>
  );
}

function RetainedDetailDrawer(drawer: HostedDetailDrawer) {
  const [mounted, setMounted] = useState(drawer.active);
  useEffect(() => {
    if (drawer.active) {
      setMounted(true);
      return;
    }
    // A history-restored payload has no live route registration to trigger
    // cleanup. Give it the same exit motion as a route-owned surface.
    const timer = window.setTimeout(
      () => setMounted(false),
      DETAIL_MOTION_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [drawer.active]);
  return drawer.active || mounted ? <DetailDrawerSurface {...drawer} /> : null;
}

export function DetailSurfaceProvider({ children }: { children: ReactNode }) {
  const { isMobile } = useSidebar();
  const nestedInspector = useNestedInspectorState();

  return (
    <DetailDrawerContext.Provider
      value={{
        closing: false,
        isMobile,
        layerZIndex:
          OVERLAY_LAYERS.detailDrawerBase - OVERLAY_LAYERS.detailDrawerStep,
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
  customHeader = false,
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
  customHeader?: boolean;
}) {
  const host = useContext(DetailDrawerHostContext);
  const slotMotion = useDetailSlotMotion();
  if (!host) {
    throw new Error("Detail drawers must be rendered inside DetailDrawerHost");
  }

  useLayoutEffect(
    () =>
      host.register({
        customHeader,
        children,
        description,
        dismissPath,
        markSlotEntered: slotMotion.markEntered,
        matchPath,
        slotEntered: slotMotion.entered,
        title,
      }),
    [
      customHeader,
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
  customHeader,
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
  const pathname = usePathname();
  const [{ detailView }, setDetailView] = useStudioQueryStates(
    detailViewParsers,
    { shallow: true },
  );
  const nestedInspector = useNestedInspectorState();
  const [entered, setEntered] = useState(slotEntered);
  const layer = useDetailStackLayer({
    dismissPath,
    id: matchPath,
    matchPath,
  });
  // Closing a child makes its parent topmost before the child's URL leaves.
  // That query belongs to the child and must never expand the retained parent.
  const expandedRequested =
    detailView === "expanded" && layer.isTop && pathname === matchPath;
  const expanded = expandedRequested || layer.expanded;
  const expandedView = expanded && !isMobile;
  // History and retained-ancestor links reopen layers in the shared stack.
  // Keep that state authoritative even when this surface stays mounted.
  const closing = layer.closing || !active;
  const titleId = `detail-drawer-title-${matchPath.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;

  const closeDrawer = useCallback(() => {
    if (closing || !layer.isTop) return;
    layer.closeTop();
  }, [closing, layer]);

  // Keyboard ownership must be ready in the same commit as the active
  // surface. Passive effects leave a gap when an ancestor becomes topmost.
  useLayoutEffect(() => {
    if (!active || !layer.isTop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Portalled menus and dialogs own their keyboard dismissal and typeahead.
      // Their first Escape must not also close the surrounding route drawer.
      if (
        event.defaultPrevented ||
        nestedInspector.nestedOpen ||
        target?.closest(
          '[role="menu"], [role="listbox"], [data-slot="dialog-content"], [data-slot="popover-content"], [data-slot="sheet-content"]',
        )
      )
        return;
      if (event.key === "Escape") closeDrawer();
      if (event.key.toLowerCase() === "e" && !event.metaKey && !event.ctrlKey) {
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
    if (
      expandedRequested &&
      studioPathname(window.location.pathname) === matchPath &&
      new URLSearchParams(window.location.search).get("detailView") ===
        "expanded"
    )
      layer.expand();
  }, [expandedRequested, layer.expand, matchPath]);

  useEffect(() => {
    layer.setSplitOpen(nestedInspector.nestedOpen);
    return () => layer.setSplitOpen(false);
  }, [layer.setSplitOpen, nestedInspector.nestedOpen]);

  useEffect(
    () => layer.registerNestedClose(nestedInspector.requestNestedClose),
    [layer.registerNestedClose, nestedInspector.requestNestedClose],
  );

  useEffect(() => {
    if (active) layer.reopen();
    else {
      nestedInspector.setNestedOpen(false);
      layer.beginClose();
    }
  }, [active, layer.beginClose, layer.reopen, nestedInspector.setNestedOpen]);

  useEffect(() => {
    if (active) {
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
  }, [markSlotEntered, active, slotEntered]);

  const sidebarOffset =
    state === "collapsed"
      ? "var(--sidebar-width-icon)"
      : "var(--sidebar-width)";
  const left = isMobile
    ? "1rem"
    : expanded
      ? sidebarOffset
      : layer.splitActive
        ? `max(calc(${sidebarOffset} + ${layer.depthBelow * 3}rem), calc(100vw - ${73 - layer.depthBelow * 3}rem))`
        : `max(${sidebarOffset}, calc(100vw - ${33 + layer.depthAbove * 3}rem))`;

  return (
    // The fragment intentionally keeps the drawer tree stable while the shared
    // stack backdrop is rendered by DetailStackProvider.
    // biome-ignore lint/complexity/noUselessFragments: preserves drawer subtree identity
    <>
      <section
        data-detail-drawer={matchPath}
        data-entry-motion={entered ? "preserve" : "enter"}
        data-state={closing ? "closed" : "open"}
        role="dialog"
        aria-modal={layer.isTop && !expandedView && !nestedInspector.nestedOpen}
        aria-labelledby={customHeader ? undefined : titleId}
        aria-label={customHeader ? title : undefined}
        data-detail-expanded={expandedView}
        onPointerDownCapture={() => {
          if (!layer.isTop) layer.closeAbove();
        }}
        style={{ left, zIndex: layer.zIndex }}
        className={cn(
          "fixed top-12 right-1 bottom-1 flex min-w-0 flex-col overflow-hidden rounded-xl border bg-background transition-[left,translate] duration-300 ease-in-out",
          expandedView ? "[box-shadow:none]" : "shadow-2xl",
          (!entered || closing) && "translate-x-[calc(100%_+_1rem)]",
        )}
      >
        {!customHeader && (
          <header
            className={cn(
              "flex h-16 shrink-0 items-center gap-3 border-b px-4",
              expandedView && "h-0 overflow-hidden border-0 p-0",
            )}
          >
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
                <OverflowText ariaLabel={description}>
                  {description}
                </OverflowText>
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
        )}
        <DetailDrawerContext.Provider
          value={{
            closing,
            isMobile,
            layerZIndex: layer.zIndex,
            navigation: {
              expanded: expandedView,
              canExpand: !isMobile && !expandedView,
              isTop: layer.isTop,
              close: closeDrawer,
              expand: () => {
                layer.expand();
                void setDetailView(
                  { detailView: "expanded" },
                  { history: "replace" },
                );
              },
            },
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
