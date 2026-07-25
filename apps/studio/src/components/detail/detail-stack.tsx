"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DETAIL_MOTION_DURATION_MS } from "@/components/detail/detail-motion";
import {
  closeAllDetailLayers,
  closeDetailLayersAbove,
  type DetailLayer,
  type DetailLayerRegistration,
  expandDetailLayerAndAncestors,
  registerDetailLayer,
  setDetailLayerClosing,
  setDetailLayerSplitOpen,
  syncDetailLayersToHistoryPath,
} from "@/components/detail/detail-stack-state";
import { detailNavigationHref } from "@/lib/nuqs";

export type { DetailLayerRegistration } from "@/components/detail/detail-stack-state";

type DetailStackContextValue = {
  beginClose: (id: string) => void;
  closeAbove: (id: string) => void;
  closeAll: () => void;
  closeTop: (id: string) => void;
  expand: (id: string) => void;
  layers: DetailLayer[];
  register: (layer: DetailLayerRegistration) => () => void;
  reopen: (id: string) => void;
  setSplitOpen: (id: string, open: boolean) => void;
};

const DetailStackContext = createContext<DetailStackContextValue | null>(null);

export function DetailStackProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [layers, setLayers] = useState<DetailLayer[]>([]);
  const timersRef = useRef(new Map<string, number>());

  const clearTimer = useCallback((key: string) => {
    const timer = timersRef.current.get(key);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timersRef.current.delete(key);
  }, []);

  const register = useCallback(
    (registration: DetailLayerRegistration) => {
      clearTimer(`remove:${registration.id}`);
      setLayers((current) => registerDetailLayer(current, registration));

      return () => {
        clearTimer(`remove:${registration.id}`);
        const timer = window.setTimeout(() => {
          timersRef.current.delete(`remove:${registration.id}`);
          setLayers((current) =>
            current.filter((layer) => layer.id !== registration.id),
          );
        }, DETAIL_MOTION_DURATION_MS);
        timersRef.current.set(`remove:${registration.id}`, timer);
      };
    },
    [clearTimer],
  );

  const beginClose = useCallback((id: string) => {
    setLayers((current) => setDetailLayerClosing(current, id, true));
  }, []);

  const reopen = useCallback((id: string) => {
    setLayers((current) => setDetailLayerClosing(current, id, false));
  }, []);

  const expand = useCallback((id: string) => {
    setLayers((current) => expandDetailLayerAndAncestors(current, id));
  }, []);

  const setSplitOpen = useCallback((id: string, open: boolean) => {
    setLayers((current) => setDetailLayerSplitOpen(current, id, open));
  }, []);

  const scheduleNavigation = useCallback(
    (key: string, navigate: () => void) => {
      clearTimer(key);
      const timer = window.setTimeout(() => {
        timersRef.current.delete(key);
        navigate();
      }, DETAIL_MOTION_DURATION_MS);
      timersRef.current.set(key, timer);
    },
    [clearTimer],
  );

  const navigateBackUntil = useCallback(
    (reachedTarget: () => boolean, fallbackHref: string) => {
      let attempts = 0;
      const step = () => {
        if (reachedTarget()) return;
        if (attempts >= 20) {
          router.push(fallbackHref);
          return;
        }
        attempts += 1;
        window.addEventListener("popstate", () => window.setTimeout(step, 0), {
          once: true,
        });
        window.history.back();
      };
      step();
    },
    [router],
  );

  const closeTop = useCallback(
    (id: string) => {
      const target = layers.find((layer) => layer.id === id);
      if (!target) return;
      beginClose(id);
      scheduleNavigation(`navigate:${id}`, () => {
        navigateBackUntil(
          () => window.location.pathname !== target.matchPath,
          detailNavigationHref(target.dismissPath, searchParams),
        );
      });
    },
    [beginClose, layers, navigateBackUntil, scheduleNavigation, searchParams],
  );

  const closeAbove = useCallback(
    (id: string) => {
      const index = layers.findIndex((layer) => layer.id === id);
      if (index < 0 || index === layers.length - 1) return;
      const target = layers[index];
      setLayers((current) => closeDetailLayersAbove(current, id));
      scheduleNavigation(`navigate-above:${id}`, () => {
        let href = detailNavigationHref(target.matchPath, searchParams);
        if (target.expanded) {
          const separator = href.includes("?") ? "&" : "?";
          href = `${href}${separator}detailView=expanded`;
        }
        navigateBackUntil(
          () => window.location.pathname === target.matchPath,
          href,
        );
      });
    },
    [layers, navigateBackUntil, scheduleNavigation, searchParams],
  );

  const closeAll = useCallback(() => {
    const bottom = layers[0];
    if (!bottom) return;
    setLayers(closeAllDetailLayers);
    scheduleNavigation("navigate:all", () => {
      const detailPaths = new Set(layers.map((layer) => layer.matchPath));
      navigateBackUntil(
        () => !detailPaths.has(window.location.pathname),
        detailNavigationHref(bottom.dismissPath, searchParams),
      );
    });
  }, [layers, navigateBackUntil, scheduleNavigation, searchParams]);

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    const syncToHistory = () => {
      setLayers((current) =>
        syncDetailLayersToHistoryPath(current, window.location.pathname),
      );
    };
    window.addEventListener("popstate", syncToHistory);
    return () => window.removeEventListener("popstate", syncToHistory);
  }, []);

  const value = useMemo(
    () => ({
      beginClose,
      closeAbove,
      closeAll,
      closeTop,
      expand,
      layers,
      register,
      reopen,
      setSplitOpen,
    }),
    [
      beginClose,
      closeAbove,
      closeAll,
      closeTop,
      expand,
      layers,
      register,
      reopen,
      setSplitOpen,
    ],
  );

  return (
    <DetailStackContext.Provider value={value}>
      {children}
    </DetailStackContext.Provider>
  );
}

export function useDetailStackSlotClosing(dismissPath: string) {
  const stack = useContext(DetailStackContext);
  if (!stack) {
    throw new Error(
      "Detail drawer slots must be rendered inside DetailStackProvider",
    );
  }
  const layer = stack.layers
    .filter((candidate) => candidate.dismissPath === dismissPath)
    .at(-1);
  return layer?.closing ?? false;
}

export function useDetailStackLayer(registration: DetailLayerRegistration): {
  beginClose: () => void;
  closeAbove: () => void;
  closeAll: () => void;
  closeTop: () => void;
  depthAbove: number;
  depthBelow: number;
  expand: () => void;
  closing: boolean;
  expanded: boolean;
  isBottom: boolean;
  isTop: boolean;
  reopen: () => void;
  setSplitOpen: (open: boolean) => void;
  splitActive: boolean;
  zIndex: number;
} {
  const stack = useContext(DetailStackContext);
  if (!stack) {
    throw new Error(
      "Detail drawers must be rendered inside DetailStackProvider",
    );
  }
  const { dismissPath, id, matchPath } = registration;

  useEffect(
    () => stack.register({ dismissPath, id, matchPath }),
    [dismissPath, id, matchPath, stack.register],
  );

  const index = stack.layers.findIndex((layer) => layer.id === id);
  const activeLayers = stack.layers.filter((layer) => !layer.closing);
  const activeIndex = activeLayers.findIndex((layer) => layer.id === id);
  const layer = stack.layers[index];
  const beginClose = useCallback(
    () => stack.beginClose(id),
    [id, stack.beginClose],
  );
  const closeAbove = useCallback(
    () => stack.closeAbove(id),
    [id, stack.closeAbove],
  );
  const closeTop = useCallback(() => stack.closeTop(id), [id, stack.closeTop]);
  const expand = useCallback(() => stack.expand(id), [id, stack.expand]);
  const reopen = useCallback(() => stack.reopen(id), [id, stack.reopen]);
  const setSplitOpen = useCallback(
    (open: boolean) => stack.setSplitOpen(id, open),
    [id, stack.setSplitOpen],
  );

  return {
    beginClose,
    closeAbove,
    closeAll: stack.closeAll,
    closeTop,
    closing: layer?.closing ?? false,
    depthAbove:
      activeIndex < 0 ? 0 : Math.max(0, activeLayers.length - activeIndex - 1),
    depthBelow: Math.max(0, activeIndex),
    expand,
    expanded: layer?.expanded ?? false,
    isBottom: index === 0,
    isTop:
      activeIndex >= 0 && activeIndex === Math.max(0, activeLayers.length - 1),
    reopen,
    setSplitOpen,
    splitActive:
      index >= 0 &&
      stack.layers
        .slice(index)
        .some((candidate) => candidate.splitOpen && !candidate.closing),
    zIndex: 50 + Math.max(0, index) * 10,
  };
}
