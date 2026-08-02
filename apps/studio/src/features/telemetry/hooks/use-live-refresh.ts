"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createLiveRefreshController,
  type LiveRefreshSnapshot,
} from "@/features/telemetry/lib/live-refresh-controller";

export const useLiveRefresh = ({
  enabled,
  resource,
}: {
  enabled: boolean;
  resource: "runs" | "sessions" | "interrupts";
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
  refreshRef.current = refresh;
  const controllerRef = useRef<
    ReturnType<typeof createLiveRefreshController> | undefined
  >(undefined);

  useEffect(() => {
    const controller = createLiveRefreshController({
      resource,
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
  }, [resource]);

  useEffect(() => {
    controllerRef.current?.setEnabled(enabled);
  }, [enabled]);

  return {
    status: snapshot.status,
    refreshing: snapshot.refreshing || transitioning,
    refreshNow: () => controllerRef.current?.refreshNow(),
  };
};
