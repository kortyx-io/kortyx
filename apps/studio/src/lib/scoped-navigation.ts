"use client";

import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
  useSearchParams as useNextSearchParams,
} from "next/navigation";
import { useQueryStates } from "nuqs";
import { useContext, useMemo } from "react";
import { useStudioRouteScope } from "@/components/studio-route-provider";
import { StudioQueryContext } from "./studio-query-context";
import { studioHref, studioPathname } from "./studio-routing";

export {
  useParams,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from "next/navigation";

export function usePathname() {
  const liveQuery = useContext(StudioQueryContext);
  const pathname = useNextPathname();
  return studioPathname(liveQuery?.pathname ?? pathname);
}
export function useSearchParams() {
  const liveQuery = useContext(StudioQueryContext);
  const searchParams = useNextSearchParams();
  return liveQuery?.searchParams ?? searchParams;
}
export function useRouter() {
  const router = useNextRouter();
  const [, waitForQueryUpdates] = useQueryStates({});
  const scope = useStudioRouteScope();
  type NavigationOptions = Parameters<typeof router.push>[1] & {
    signal?: AbortSignal;
    /** Update client-owned query state without re-intercepting the same page. */
    shallow?: boolean;
  };
  return useMemo(() => {
    const navigate = (
      method: "push" | "replace",
      href: string,
      options?: NavigationOptions,
    ) => {
      const { signal, shallow, ...nextOptions } = options ?? {};
      const go = () => {
        if (signal?.aborted) return;
        const scopedHref = studioHref(href, scope);
        const destination = new URL(scopedHref, window.location.origin);
        if (
          shallow &&
          destination.origin === window.location.origin &&
          destination.pathname === window.location.pathname
        ) {
          window.history[method === "push" ? "pushState" : "replaceState"](
            null,
            "",
            scopedHref,
          );
        } else router[method](scopedHref, options ? nextOptions : undefined);
      };
      // Nuqs updates React before its throttled history write. Let queued
      // writes settle so they cannot restore the old route after navigation.
      // An empty update waits for the shared batch without changing its keys.
      void waitForQueryUpdates({}).then(go, go);
    };
    return {
      ...router,
      push: (href: string, options?: NavigationOptions) =>
        navigate("push", href, options),
      replace: (href: string, options?: NavigationOptions) =>
        navigate("replace", href, options),
      prefetch: (
        href: string,
        options?: Parameters<typeof router.prefetch>[1],
      ) => router.prefetch(studioHref(href, scope), options),
    };
  }, [router, scope, waitForQueryUpdates]);
}
