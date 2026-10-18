import {
  applyTablePreferenceOperation,
  emptyTablePreferences,
  type StudioTablePreferenceOperation,
  StudioTablePreferenceOperationSchema,
  StudioTablePreferenceResponseSchema,
  type StudioTablePreferenceScope,
  type StudioTablePreferences,
  StudioTablePreferencesSchema,
} from "@kortyx/telemetry-contracts";
import type {
  TablePreferenceEntry,
  TablePreferenceSnapshot,
} from "@/components/data-table/table-persistence";
import { STUDIO_REQUEST_PATH } from "@/lib/studio-routing";

/** One cache/queue per owner, project and table. No unscoped legacy data is read. */
export function createTablePreferenceEntry(
  scope: StudioTablePreferenceScope,
  tableId: string,
  remote: boolean,
): TablePreferenceEntry {
  const cacheEnabled = scope.cacheKey !== "0".repeat(64);
  const key = `kortyx.table-cache.v1.${scope.cacheKey}.${tableId}`;
  let server = emptyTablePreferences();
  let pending: StudioTablePreferenceOperation[] = [];
  const initial: TablePreferenceSnapshot = {
    preferences: server,
    hydrated: false,
    status: "loading",
  };
  let snapshot = initial;
  const listeners = new Set<() => void>();
  let serverKnown = false;
  let started = false,
    disposed = false,
    refreshing = false,
    sending = false,
    blocked = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: StudioTablePreferenceOperation | undefined;
  const controller = new AbortController();
  let requestPath = "";
  const emit = (status: TablePreferenceSnapshot["status"], error?: string) => {
    if (disposed) return;
    if (!cacheEnabled && !error)
      error =
        "Project identity unavailable. Preferences remain in this tab only.";
    let preferences = server;
    try {
      preferences = pending.reduce(applyTablePreferenceOperation, server);
    } catch {
      blocked = true;
      status = "conflict";
      error =
        "Saved views reached the limit. Reload preferences to discard pending changes.";
      preferences = snapshot.preferences;
    }
    snapshot = { preferences, hydrated: true, status, error };
    try {
      if (cacheEnabled)
        localStorage.setItem(key, JSON.stringify({ server, pending }));
    } catch {
      /* Cache is optional; DB writes still work. */
    }
    listeners.forEach((fn) => {
      fn();
    });
  };
  const request = async (body?: unknown): Promise<StudioTablePreferences> => {
    const response = await fetch(
      `/api/studio/table-preferences/${encodeURIComponent(tableId)}`,
      {
        method: body ? "POST" : "GET",
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10000),
        ]),
        headers: {
          "content-type": "application/json",
          "x-kortyx-preferences": "1",
          [STUDIO_REQUEST_PATH]: requestPath,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok) {
      const failure = await response.json().catch(() => null);
      throw Object.assign(new Error("Preferences unavailable"), {
        status: response.status,
        readOnly:
          response.status === 403 && failure?.error === "PREFERENCE_READ_ONLY",
      });
    }
    const result = StudioTablePreferenceResponseSchema.parse(
      await response.json(),
    );
    if (result.scope.cacheKey !== scope.cacheKey)
      throw Object.assign(new Error("Preference identity changed"), {
        status: 403,
      });
    return result.preferences;
  };
  const fail = (error: unknown) => {
    blocked = true;
    const status = (error as { status?: number }).status;
    const readOnly = (error as { readOnly?: boolean }).readOnly === true;
    if (status === 401 || (status === 403 && !readOnly)) {
      pending = [];
      server = emptyTablePreferences();
      emit("error", "Account, project, or access changed. Reload this page.");
      try {
        localStorage.removeItem(key);
      } catch {
        /* optional */
      }
    } else
      emit(
        status === 409 ? "conflict" : "error",
        readOnly
          ? "Shared project preferences are read-only. Your changes are cached in this browser."
          : status === 409
            ? "Preferences changed elsewhere. Reload them or save your pending changes."
            : pending.length
              ? "Changes are cached in this browser but have not been saved to the database."
              : "Could not refresh preferences. Showing this browser’s cache.",
      );
  };
  const flush = async () => {
    if (
      disposed ||
      !remote ||
      refreshing ||
      sending ||
      blocked ||
      !pending.length
    )
      return;
    sending = true;
    emit("saving");
    try {
      while (pending.length && !disposed) {
        const operation = pending[0];
        inFlight = operation;
        server = await request({
          scopeKey: scope.cacheKey,
          expectedRevision: server.revision,
          operation,
        });
        serverKnown = true;
        pending = pending.filter((op) => op !== operation);
        emit(pending.length ? "saving" : "saved");
      }
    } catch (error) {
      if (!disposed) fail(error);
    } finally {
      sending = false;
      inFlight = undefined;
    }
  };
  const refresh = async (discard: boolean, allowRebase = false) => {
    if (disposed || refreshing || sending || !remote) return;
    refreshing = true;
    const discarded = discard ? new Set(pending) : null;
    try {
      const next = await request();
      const changedElsewhere =
        serverKnown &&
        next.revision !== server.revision &&
        pending.length > 0 &&
        !allowRebase &&
        !discard;
      server = next;
      serverKnown = true;
      if (changedElsewhere) {
        fail({ status: 409 });
        return;
      }
      if (discarded)
        pending = pending.filter((operation) => !discarded.has(operation));
      blocked = false;
      emit(pending.length ? "saving" : "saved");
    } catch (error) {
      if (!disposed) fail(error);
    } finally {
      refreshing = false;
    }
    if (!blocked) void flush();
  };
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    start: () => {
      if (started) {
        if (remote && !blocked && !pending.length) void refresh(false);
        return;
      }
      started = true;
      requestPath = window.location.pathname;
      try {
        const raw = cacheEnabled ? localStorage.getItem(key) : null;
        if (raw) {
          const cached = JSON.parse(raw);
          const cachedServer = StudioTablePreferencesSchema.parse(
            cached.server,
          );
          const cachedPending = StudioTablePreferenceOperationSchema.array()
            .max(100)
            .parse(cached.pending);
          cachedPending.reduce(applyTablePreferenceOperation, cachedServer);
          server = cachedServer;
          serverKnown = true;
          pending = cachedPending;
        }
      } catch {
        /* Invalid cache is ignored. */
      }
      emit(
        remote ? "loading" : "local",
        cacheEnabled
          ? undefined
          : "Project identity unavailable. Preferences remain in this tab only.",
      );
      if (remote) void refresh(false);
    },
    mutate: (operation) => {
      if (disposed) return;
      applyTablePreferenceOperation(snapshot.preferences, operation);
      const last = pending.at(-1);
      if (
        operation.kind === "defaults" &&
        last?.kind === "defaults" &&
        last !== inFlight
      )
        pending[pending.length - 1] = {
          kind: "defaults",
          patch: { ...last.patch, ...operation.patch },
        };
      else {
        if (pending.length >= 100) {
          emit(
            "error",
            "Too many unsaved changes. Retry saving before making more changes.",
          );
          return;
        }
        pending.push(operation);
      }
      if (!remote) {
        server = pending.reduce(applyTablePreferenceOperation, server);
        pending = [];
      }
      emit(
        remote ? (blocked ? snapshot.status : "saving") : "local",
        blocked ? snapshot.error : undefined,
      );
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 500);
    },
    retry: () => {
      void refresh(false, true);
    },
    reload: () => {
      void refresh(true);
    },
    dispose: () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
      listeners.clear();
    },
  };
}
