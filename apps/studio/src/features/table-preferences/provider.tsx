"use client";
import type { StudioTablePreferenceScope } from "@kortyx/telemetry-contracts";
import { type ReactNode, useEffect, useMemo } from "react";
import {
  TablePreferenceEntries,
  type TablePreferenceEntry,
} from "@/components/data-table/table-persistence";
import { createTablePreferenceEntry } from "./cache";
export function TablePreferencesProvider({
  scope,
  remote,
  children,
}: {
  scope?: StudioTablePreferenceScope | null;
  remote: boolean;
  children: ReactNode;
}) {
  const cacheKey = scope?.cacheKey;
  const ownerKind = scope?.ownerKind;
  const store = useMemo(() => {
    const entries = new Map<string, TablePreferenceEntry>();
    return {
      entries,
      disposal: undefined as ReturnType<typeof setTimeout> | undefined,
      get: (tableId: string) => {
        let entry = entries.get(tableId);
        if (!entry) {
          entry = createTablePreferenceEntry(
            {
              cacheKey: cacheKey ?? "0".repeat(64),
              ownerKind: ownerKind ?? "project",
            },
            tableId,
            remote && Boolean(cacheKey),
          );
          entries.set(tableId, entry);
        }
        return entry;
      },
    };
  }, [cacheKey, ownerKind, remote]);
  useEffect(() => {
    clearTimeout(store.disposal);
    const refresh = () => {
      store.entries.forEach((entry) => {
        entry.start();
      });
    };
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      store.disposal = setTimeout(
        () =>
          store.entries.forEach((entry) => {
            entry.dispose();
          }),
        0,
      );
    };
  }, [store]);
  return (
    <TablePreferenceEntries.Provider value={store.get}>
      {children}
    </TablePreferenceEntries.Provider>
  );
}
