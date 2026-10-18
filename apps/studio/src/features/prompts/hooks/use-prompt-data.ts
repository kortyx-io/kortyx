"use client";

import {
  type PromptDetail,
  PromptDetailSchema,
  type PromptLibrary,
  PromptLibrarySchema,
} from "@kortyx/telemetry-contracts";
import { useCallback, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useStudioRouteScope } from "@/components/studio-route-provider";
import { studioHref } from "@/lib/studio-routing";
import { promptRequest } from "../api/client";
import {
  promptLibraryCacheEntries,
  promptLibraryCacheKey,
} from "../lib/library-cache";

type PromptKey = readonly ["prompts", string, string];

function usePromptScope() {
  const scope = useStudioRouteScope();
  return studioHref("/prompts", scope);
}

/** Refresh visited lists as well as mounted details without replacing drawers. */
export function useRefreshPromptData() {
  const scope = usePromptScope();
  const { cache, mutate } = useSWRConfig();
  return useCallback(
    () =>
      Promise.all([
        // SWR's no-data mutate only revalidates mounted hooks. A previously
        // visited list has no fetcher while unmounted, so populate it explicitly
        // before returning through a cached Next route.
        ...promptLibraryCacheEntries(cache.keys(), scope).map(({ key, path }) =>
          mutate(key, readLibrary(["prompts", scope, path]), {
            revalidate: false,
            // The write already succeeded. Report a read failure through SWR,
            // not as a failed creation that invites an accidental retry.
            throwOnError: false,
          }),
        ),
        mutate(
          (key) =>
            Array.isArray(key) && key[0] === "prompts" && key[1] === scope,
        ),
      ]),
    [cache, mutate, scope],
  );
}

const readLibrary = async ([, scope, path]: PromptKey) =>
  PromptLibrarySchema.parse(
    await promptRequest(path, undefined, undefined, scope),
  );
const readDetail = async ([, scope, path]: PromptKey) =>
  PromptDetailSchema.parse(
    await promptRequest(path, undefined, undefined, scope),
  );

export function usePromptLibrary(
  initial: PromptLibrary | null,
  path = "library",
  initialPath = path,
) {
  const scope = usePromptScope();
  return useSWR<PromptLibrary, Error>(
    promptLibraryCacheKey(scope, path),
    () => readLibrary(["prompts", scope, path]),
    {
      fallbackData: path === initialPath ? (initial ?? undefined) : undefined,
      keepPreviousData: true,
      // Server-rendered data gives the first paint; revalidation also covers
      // revisiting a cached RSC route after a mutation in another prompt surface.
      revalidateOnMount: true,
    },
  );
}

export function usePromptDetail(
  initial: PromptDetail,
  version: number | null,
  paused: boolean,
) {
  const scope = usePromptScope();
  const path = `assets/${initial.asset.id}${version ? `?version=${version}` : ""}`;
  // Revalidation must not collapse history pages explicitly loaded by the user.
  // The ref points at SWR's last rendered snapshot; SWR still owns the data.
  const snapshot = useRef(initial);
  const read = async (key: PromptKey) => {
    const next = await readDetail(key);
    const current = snapshot.current;
    if (current.asset.id !== next.asset.id) return next;
    return {
      ...next,
      versions: [
        ...next.versions,
        ...current.versions.filter(
          (version) =>
            !next.versions.some((item) => item.version === version.version),
        ),
      ].sort((a, b) => b.version - a.version),
      versionsNextCursor:
        current.versions.length > 100
          ? current.versionsNextCursor
          : next.versionsNextCursor,
    };
  };
  const query = useSWR<PromptDetail, Error>(
    ["prompts", scope, path] as const,
    read,
    {
      fallbackData: initial,
      keepPreviousData: true,
      refreshInterval: paused ? 0 : 5000,
      revalidateOnFocus: !paused,
      revalidateOnReconnect: !paused,
    },
  );
  snapshot.current = query.data ?? initial;
  const { mutate } = query;
  const setDetail = useCallback(
    (update: (current: PromptDetail) => PromptDetail) => {
      void mutate((current) => update(current ?? initial), {
        revalidate: false,
      });
    },
    [mutate, initial],
  );
  const refresh = async (selectedVersion = version) => {
    const next = await mutate(
      read([
        "prompts",
        scope,
        `assets/${initial.asset.id}${selectedVersion ? `?version=${selectedVersion}` : ""}`,
      ]),
      { revalidate: false },
    );
    if (!next) throw new Error("Prompt data is unavailable.");
    return next;
  };
  return { ...query, detail: query.data ?? initial, setDetail, refresh };
}
