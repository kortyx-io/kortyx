"use client";

import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from "next/navigation";
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
  const scope = useStudioRouteScope();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) =>
        router.push(studioHref(href, scope), options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) =>
        router.replace(studioHref(href, scope), options),
      prefetch: (
        href: string,
        options?: Parameters<typeof router.prefetch>[1],
      ) => router.prefetch(studioHref(href, scope), options),
    }),
    [router, scope],
  );
}
