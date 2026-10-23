"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type unstable_AdapterInterface as AdapterInterface,
  unstable_createAdapterProvider as createAdapterProvider,
  renderQueryString,
} from "nuqs/adapters/custom";
import { NuqsAdapter } from "nuqs/adapters/react";
import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { StudioQueryContext } from "@/lib/studio-query-context";

const SharedAdapter = createAdapterProvider(function useSharedAdapter() {
  const adapter = useContext(StudioQueryContext);
  if (!adapter) throw new Error("Studio query snapshot is unavailable");
  return adapter;
});

const QUERY_UPDATE_EVENT = "kortyx:query-update";
function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(QUERY_UPDATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(QUERY_UPDATE_EVENT, onChange);
  };
}
function currentLocation() {
  return window.location.pathname + window.location.search;
}

export function StudioQueryAdapter({ children }: { children: ReactNode }) {
  // Read Next's live context outside retained parallel-route payloads. Their
  // cached context can otherwise hide Back/Forward and shallow URL updates.
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const location = useSyncExternalStore(
    subscribeToLocation,
    currentLocation,
    () => `${pathname}${search ? `?${search}` : ""}`,
  );
  const router = useRouter();
  useEffect(() => {
    // Next commits its history URL after rendering the destination. Recheck
    // the store after that commit as well as on shallow writes and popstate.
    const committed = new URL(window.location.href);
    if (
      committed.pathname === pathname &&
      committed.searchParams.toString() === search
    )
      window.dispatchEvent(new Event(QUERY_UPDATE_EVENT));
  }, [pathname, search]);
  const updateUrl = useCallback<AdapterInterface["updateUrl"]>(
    (params, options) => {
      const url = new URL(window.location.href);
      url.search = renderQueryString(params);
      if (options.shallow) {
        window.history[
          options.history === "push" ? "pushState" : "replaceState"
        ](null, "", url);
        window.dispatchEvent(new Event(QUERY_UPDATE_EVENT));
        if (options.scroll) window.scrollTo(0, 0);
      } else {
        router[options.history === "push" ? "push" : "replace"](url.href, {
          scroll: options.scroll,
        });
      }
    },
    [router],
  );
  const adapter = useMemo<AdapterInterface>(() => {
    const url = new URL(location, "http://studio.local");
    return {
      pathname: url.pathname,
      searchParams: url.searchParams,
      updateUrl,
    };
  }, [location, updateUrl]);
  return (
    // The React adapter supplies Nuqs' popstate queue cleanup. The custom
    // adapter keeps Next navigation for server-backed updates and shares one
    // root snapshot with every retained drawer using the supported API.
    <NuqsAdapter serverSearch={search}>
      <StudioQueryContext.Provider value={adapter}>
        <SharedAdapter>{children}</SharedAdapter>
      </StudioQueryContext.Provider>
    </NuqsAdapter>
  );
}
