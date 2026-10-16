"use client";

import {
  type DiagnosticContent,
  DiagnosticContentSchema,
} from "@kortyx/telemetry-contracts";
import useSWR, { preload, unstable_serialize, useSWRConfig } from "swr";
import { useStudioRouteScope } from "@/components/studio-route-provider";
import { studioFetch } from "@/lib/studio-fetch";
import { studioHref } from "@/lib/studio-routing";

type DiagnosticKey = readonly ["diagnostics", string, string];
async function readDiagnostic([, , url]: DiagnosticKey) {
  const response = await studioFetch(url, { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      `Full error details could not be loaded (HTTP ${response.status}).`,
    );
  return DiagnosticContentSchema.parse(await response.json());
}

function diagnosticPath(diagnosticId: string, environment: string) {
  return `/api/studio/diagnostics/${encodeURIComponent(diagnosticId)}?env=${encodeURIComponent(environment)}`;
}

/** Immutable diagnostic content stays cached under its authorized workspace URL. */
export function useDiagnosticContent(
  diagnosticId?: string,
  environment?: string,
  exception?: DiagnosticContent,
) {
  const scope = useStudioRouteScope();
  const { cache } = useSWRConfig();
  const key: DiagnosticKey | null =
    diagnosticId && environment
      ? [
          "diagnostics",
          studioHref("/diagnostics", scope),
          diagnosticPath(diagnosticId, environment),
        ]
      : null;
  return useSWR(key, readDiagnostic, {
    fallbackData: exception,
    revalidateOnMount: key ? !cache.get(unstable_serialize(key))?.data : false,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
}

/** Hover/focus starts the same request used on selection, without fetching the whole list. */
export function usePreloadDiagnostic(environment: string) {
  const scope = useStudioRouteScope();
  const { cache } = useSWRConfig();
  return (diagnosticId?: string) => {
    if (!diagnosticId) return;
    const key: DiagnosticKey = [
      "diagnostics",
      studioHref("/diagnostics", scope),
      diagnosticPath(diagnosticId, environment),
    ];
    if (cache.get(unstable_serialize(key))?.data) return;
    void preload(key, readDiagnostic).catch(() => undefined);
  };
}
