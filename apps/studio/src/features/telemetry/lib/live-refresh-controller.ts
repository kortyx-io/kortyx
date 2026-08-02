export type LiveRefreshStatus =
  | "off"
  | "connecting"
  | "live"
  | "reconnecting"
  | "paused";

export type LiveRefreshSnapshot = {
  status: LiveRefreshStatus;
  refreshing: boolean;
};

type LiveEventSource = {
  close: () => void;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener: (
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ) => void;
};

type Timer = ReturnType<typeof setTimeout>;

export type LiveRefreshControllerOptions = {
  resource: "runs" | "sessions" | "interrupts";
  refresh: () => Promise<void>;
  onSnapshot: (snapshot: LiveRefreshSnapshot) => void;
  createEventSource?: (url: string) => LiveEventSource;
  random?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  reconnectDelayMs?: number;
  fallbackMinMs?: number;
  fallbackMaxMs?: number;
};

export type LiveRefreshController = {
  setEnabled: (enabled: boolean) => void;
  setAvailable: (available: boolean) => void;
  refreshNow: () => void;
  dispose: () => void;
};

export const createLiveRefreshController = (
  options: LiveRefreshControllerOptions,
): LiveRefreshController => {
  const createEventSource =
    options.createEventSource ??
    ((url: string) => new EventSource(url) as LiveEventSource);
  const random = options.random ?? Math.random;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const reconnectDelayMs = options.reconnectDelayMs ?? 3_000;
  const fallbackMinMs = options.fallbackMinMs ?? 30_000;
  const fallbackMaxMs = options.fallbackMaxMs ?? 60_000;

  let enabled = false;
  let available = true;
  let disposed = false;
  let source: LiveEventSource | undefined;
  let reconnectTimer: Timer | undefined;
  let fallbackTimer: Timer | undefined;
  let refreshActive = false;
  let refreshTrailing = false;
  let refreshTrailingForced = false;
  let openedOnce = false;
  let snapshot: LiveRefreshSnapshot = {
    status: "off",
    refreshing: false,
  };

  const publish = (next: Partial<LiveRefreshSnapshot>) => {
    const updated = { ...snapshot, ...next };
    if (
      updated.status === snapshot.status &&
      updated.refreshing === snapshot.refreshing
    ) {
      return;
    }
    snapshot = updated;
    options.onSnapshot(snapshot);
  };

  const clearScheduledWork = () => {
    if (reconnectTimer) clearTimer(reconnectTimer);
    if (fallbackTimer) clearTimer(fallbackTimer);
    reconnectTimer = undefined;
    fallbackTimer = undefined;
  };

  const closeSource = () => {
    source?.close();
    source = undefined;
  };

  const requestRefresh = (force = false) => {
    if (disposed || (!force && (!enabled || !available))) return;
    if (refreshActive) {
      refreshTrailing = true;
      refreshTrailingForced ||= force;
      return;
    }
    refreshActive = true;
    publish({ refreshing: true });
    void options
      .refresh()
      .catch(() => undefined)
      .finally(() => {
        refreshActive = false;
        publish({ refreshing: false });
        if (refreshTrailing) {
          const forceTrailingRefresh = refreshTrailingForced;
          refreshTrailing = false;
          refreshTrailingForced = false;
          requestRefresh(forceTrailingRefresh);
        }
      });
  };

  const scheduleFallback = () => {
    if (fallbackTimer || !enabled || !available || disposed) return;
    const delay =
      fallbackMinMs +
      Math.round(random() * Math.max(0, fallbackMaxMs - fallbackMinMs));
    fallbackTimer = setTimer(() => {
      fallbackTimer = undefined;
      if (snapshot.status !== "live") {
        requestRefresh();
        scheduleFallback();
      }
    }, delay);
  };

  const connect = (refreshOnOpen = false) => {
    if (!enabled || !available || disposed || source) return;
    publish({ status: openedOnce ? "reconnecting" : "connecting" });
    const nextSource = createEventSource(
      `/api/studio/changes?resources=${options.resource}`,
    );
    source = nextSource;
    nextSource.onopen = () => {
      if (source !== nextSource) return;
      clearScheduledWork();
      publish({ status: "live" });
      if (refreshOnOpen) requestRefresh();
      openedOnce = true;
    };
    nextSource.onerror = () => {
      if (source !== nextSource) return;
      closeSource();
      publish({ status: "reconnecting" });
      scheduleFallback();
      reconnectTimer = setTimer(() => {
        reconnectTimer = undefined;
        connect(true);
      }, reconnectDelayMs);
    };
    nextSource.addEventListener("change", () => requestRefresh());
  };

  const reconcile = () => {
    clearScheduledWork();
    closeSource();
    if (!enabled) {
      publish({ status: "off" });
      return;
    }
    if (!available) {
      publish({ status: "paused" });
      return;
    }
    requestRefresh();
    connect();
  };

  options.onSnapshot(snapshot);

  return {
    setEnabled(nextEnabled) {
      if (enabled === nextEnabled || disposed) return;
      enabled = nextEnabled;
      if (!enabled) {
        refreshTrailing = false;
        refreshTrailingForced = false;
        openedOnce = false;
      }
      reconcile();
    },
    setAvailable(nextAvailable) {
      if (available === nextAvailable || disposed) return;
      available = nextAvailable;
      reconcile();
    },
    refreshNow: () => requestRefresh(true),
    dispose() {
      disposed = true;
      clearScheduledWork();
      closeSource();
      refreshTrailing = false;
      refreshTrailingForced = false;
    },
  };
};
