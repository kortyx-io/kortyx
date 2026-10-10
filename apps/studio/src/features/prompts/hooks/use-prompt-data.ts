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

type PromptKey = readonly ["prompts", string, string];

function usePromptScope() {
  const scope = useStudioRouteScope();
  return studioHref("/prompts", scope);
}

/** Revalidate mounted prompt surfaces without replacing their routes or drawers. */
export function useRefreshPromptData() {
  const scope = usePromptScope();
  const { mutate } = useSWRConfig();
  return useCallback(
    () =>
      mutate(
        (key) => Array.isArray(key) && key[0] === "prompts" && key[1] === scope,
      ),
    [mutate, scope],
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
) {
  const scope = usePromptScope();
  return useSWR<PromptLibrary, Error>(
    ["prompts", scope, path] as const,
    readLibrary,
    {
      fallbackData: initial ?? undefined,
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
