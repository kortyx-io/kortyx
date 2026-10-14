"use client";

import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from "next/navigation";
import { useQueryStates } from "nuqs";
import { useMemo } from "react";
import { useStudioRouteScope } from "@/components/studio-route-provider";
import { studioHref, studioPathname } from "./studio-routing";

export {
  useParams,
  useSearchParams,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from "next/navigation";

export function usePathname() {
  return studioPathname(useNextPathname());
}
export function useRouter() {
  const router = useNextRouter();
  const [, waitForQueryUpdates] = useQueryStates({});
  const scope = useStudioRouteScope();
  return useMemo(() => {
    const navigate = (
      method: "push" | "replace",
      href: string,
      options?: Parameters<typeof router.push>[1],
    ) => {
      const go = () => router[method](studioHref(href, scope), options);
      // Nuqs updates React before its throttled history write. Let queued
      // writes settle so they cannot restore the old route after navigation.
      // An empty update waits for the shared batch without changing its keys.
      void waitForQueryUpdates({}).then(go, go);
    };
    return {
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) =>
        navigate("push", href, options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) =>
        navigate("replace", href, options),
      prefetch: (
        href: string,
        options?: Parameters<typeof router.prefetch>[1],
      ) => router.prefetch(studioHref(href, scope), options),
    };
  }, [router, scope, waitForQueryUpdates]);
}
