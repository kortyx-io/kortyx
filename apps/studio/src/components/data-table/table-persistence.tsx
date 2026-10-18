"use client";
import type {
  StudioTablePreferenceOperation,
  StudioTablePreferences,
} from "@kortyx/telemetry-contracts";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
export type TablePreferenceSnapshot = {
  preferences: StudioTablePreferences;
  hydrated: boolean;
  status: "loading" | "local" | "saved" | "saving" | "error" | "conflict";
  error?: string;
};
export interface TablePreferenceEntry {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => TablePreferenceSnapshot;
  getServerSnapshot: () => TablePreferenceSnapshot;
  start: () => void;
  mutate: (operation: StudioTablePreferenceOperation) => void;
  retry: () => void;
  reload: () => void;
  dispose: () => void;
}
export const TablePreferenceEntries = createContext<
  ((tableId: string) => TablePreferenceEntry) | null
>(null);
export function useTablePreferenceEntry(tableId: string) {
  const factory = useContext(TablePreferenceEntries);
  const entry = useMemo(() => factory?.(tableId) ?? null, [factory, tableId]);
  useEffect(() => {
    entry?.start();
  }, [entry]);
  return entry;
}
const emptySubscribe = () => () => {};
const emptySnapshot = () => null;
export function useTablePreferenceSnapshot(entry: TablePreferenceEntry | null) {
  return useSyncExternalStore(
    entry?.subscribe ?? emptySubscribe,
    entry?.getSnapshot ?? emptySnapshot,
    entry?.getServerSnapshot ?? emptySnapshot,
  );
}
export const CurrentTablePreference =
  createContext<TablePreferenceEntry | null>(null);
