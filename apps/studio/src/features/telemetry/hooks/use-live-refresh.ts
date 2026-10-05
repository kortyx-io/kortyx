"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createLiveRefreshController,
  type LiveRefreshSnapshot,
} from "@/features/telemetry/lib/live-refresh-controller";
import { useRouter } from "@/lib/scoped-navigation";

export const useLiveRefresh = ({
  enabled,
  resource,
  relatedResources,
  refresh: refreshData,
}: {
  enabled: boolean;
  resource: "runs" | "sessions" | "interrupts" | "evals";
  relatedResources?: readonly ("runs" | "sessions" | "interrupts" | "evals")[];
  refresh?: () => Promise<void>;
}) => {
  const router = useRouter();
  const [transitioning, startTransition] = useTransition();
  const [snapshot, setSnapshot] = useState<LiveRefreshSnapshot>({
    status: enabled ? "connecting" : "off",
    refreshing: false,
  });
  const transitionResolveRef = useRef<(() => void) | undefined>(undefined);
  const transitionObservedRef = useRef(false);

  const refresh = useCallback(
    () =>
      new Promise<void>((resolve) => {
        transitionResolveRef.current?.();
        transitionResolveRef.current = resolve;
        transitionObservedRef.current = false;
        startTransition(() => router.refresh());
        window.setTimeout(() => {
          if (transitionResolveRef.current === resolve) {
            transitionResolveRef.current = undefined;
            resolve();
          }
        }, 10_000);
      }),
    [router],
  );

  useEffect(() => {
    if (transitioning) {
      transitionObservedRef.current = true;
      return;
    }
    if (!transitionObservedRef.current) return;
    transitionObservedRef.current = false;
    const resolve = transitionResolveRef.current;
    transitionResolveRef.current = undefined;
    resolve?.();
  }, [transitioning]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refreshData ?? refresh;
  const relatedKey = relatedResources?.join(",") ?? "";
  const controllerRef = useRef<
    ReturnType<typeof createLiveRefreshController> | undefined
  >(undefined);

  useEffect(() => {
    const controller = createLiveRefreshController({
      resource,
      relatedResources: relatedKey
        ? (relatedKey.split(",") as NonNullable<typeof relatedResources>)
        : [],
      refresh: () => refreshRef.current(),
      onSnapshot: setSnapshot,
    });
    controllerRef.current = controller;

    const syncAvailability = () =>
      controller.setAvailable(
        document.visibilityState === "visible" && navigator.onLine,
      );
    syncAvailability();
    document.addEventListener("visibilitychange", syncAvailability);
    window.addEventListener("online", syncAvailability);
    window.addEventListener("offline", syncAvailability);

    return () => {
      document.removeEventListener("visibilitychange", syncAvailability);
      window.removeEventListener("online", syncAvailability);
      window.removeEventListener("offline", syncAvailability);
      controller.dispose();
      controllerRef.current = undefined;
    };
  }, [resource, relatedKey]);

  useEffect(() => {
    controllerRef.current?.setEnabled(enabled);
  }, [enabled]);

  return {
    status: snapshot.status,
    refreshing: snapshot.refreshing || transitioning,
    refreshNow: () => controllerRef.current?.refreshNow(),
  };
};
