"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  configureStudioUsage,
  flushStudioUsage,
  studioFeature,
  usageSurface,
} from "./client";
import type { StudioUsageConfig } from "./contracts";
export function UsageProvider({
  config,
  children,
}: {
  config: StudioUsageConfig;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const previous = useRef<string | undefined>(undefined);
  // Idempotent bootstrap runs before child effects; identities are created only on flush.
  if (typeof window !== "undefined") configureStudioUsage(config);
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") void flushStudioUsage();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    studioFeature("studio.navigation", {
      resource: usageSurface(pathname),
      action: "view",
    });
  }, [pathname]);
  return children;
}
