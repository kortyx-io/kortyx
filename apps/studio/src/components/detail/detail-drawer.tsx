"use client";

import { Maximize2, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseAsStringLiteral } from "nuqs";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { DETAIL_MOTION_DURATION_MS } from "@/components/detail/detail-motion";
import { useDetailSlotMotion } from "@/components/detail/detail-slot-presence";
import { Button } from "@/components/ui/button";
import { OverflowText } from "@/components/ui/overflow-tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { detailNavigationHref, useStudioQueryStates } from "@/lib/nuqs";
import { cn } from "@/lib/utils";

type DetailDrawerContextValue = {
  closing: boolean;
  isMobile: boolean;
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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, isMobile } = useSidebar();
  const [{ detailView }, setDetailView] = useStudioQueryStates(
    detailViewParsers,
    { shallow: true },
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const explicitCloseRef = useRef(false);
  const nestedInspector = useNestedInspectorState();
  const slotMotion = useDetailSlotMotion();
  const [entered, setEntered] = useState(slotMotion.entered);
  const [closing, setClosing] = useState(false);
  const routeVisible = pathname === matchPath;
  const [rendered, setRendered] = useState(routeVisible);
  const expanded = detailView === "expanded";
  const expandedView = expanded && !isMobile;

  const closeDrawer = useCallback(() => {
    if (closing) return;
    explicitCloseRef.current = true;
    setClosing(true);
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      router.push(detailNavigationHref(dismissPath, searchParams));
    }, DETAIL_MOTION_DURATION_MS);
  }, [closing, dismissPath, router, searchParams]);

  useEffect(() => {
    if (!routeVisible) return;
    headingRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (nestedInspector.nestedOpen) return;
      if (event.key === "Escape") closeDrawer();
      if (event.key.toLowerCase() === "e" && !event.metaKey && !event.ctrlKey) {
        const target = event.target as HTMLElement | null;
        if (
          !expandedView &&
          !target?.matches("input, textarea, select, [contenteditable=true]")
        ) {
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
    nestedInspector.nestedOpen,
    routeVisible,
    setDetailView,
  ]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  // Next updates the pathname before a retained parallel route is discarded.
  // Keep this surface rendered during that pathname transition so browser
  // Back/Forward receives the same exit motion as an explicit close.
  // biome-ignore lint/correctness/useExhaustiveDependencies: this state machine intentionally reacts only to route identity
  useEffect(() => {
    nestedInspector.setNestedOpen(false);

    if (routeVisible) {
      explicitCloseRef.current = false;
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setRendered(true);
      setClosing(false);
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

    if (explicitCloseRef.current) {
      explicitCloseRef.current = false;
      setRendered(false);
      setEntered(false);
      setClosing(false);
      return;
    }

    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setRendered(false);
      setEntered(false);
      setClosing(false);
    }, DETAIL_MOTION_DURATION_MS);

    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [matchPath, routeVisible, slotMotion]);

  if (!rendered) return null;

  const sidebarOffset =
    state === "collapsed"
      ? "var(--sidebar-width-icon)"
      : "var(--sidebar-width)";
  const left = isMobile
    ? "1rem"
    : expanded
      ? sidebarOffset
      : nestedInspector.nestedOpen
        ? `max(${sidebarOffset}, calc(100vw - 73rem))`
        : `max(${sidebarOffset}, calc(100vw - 33rem))`;

  return (
    <>
      <button
        type="button"
        aria-label="Close detail"
        tabIndex={-1}
        onClick={closeDrawer}
        className={cn(
          "fixed inset-0 z-40 bg-overlay transition-opacity duration-300 ease-in-out",
          expandedView && "pointer-events-none opacity-0",
          (!entered || closing) && "pointer-events-none opacity-0",
        )}
      />
      <section
        role="dialog"
        aria-modal={!expandedView && !nestedInspector.nestedOpen}
        aria-labelledby="detail-drawer-title"
        style={{ left }}
        className={cn(
          "fixed top-12 right-4 bottom-4 z-50 flex min-w-0 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl transition-[left,translate] duration-300 ease-in-out",
          (!entered || closing) && "translate-x-[calc(100%_+_1rem)]",
        )}
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          {!isMobile && !expandedView && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Expand detail"
              onClick={() =>
                void setDetailView(
                  { detailView: "expanded" },
                  { history: "replace" },
                )
              }
            >
              <Maximize2 />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h1
              ref={headingRef}
              id="detail-drawer-title"
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
          {!expandedView && (
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
