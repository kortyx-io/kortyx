import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLiveRefreshController,
  type LiveRefreshSnapshot,
} from "./live-refresh-controller";

type TestSource = {
  close: () => void;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  change: (() => void) | undefined;
};

const sourceFactory = () => {
  const sources: TestSource[] = [];
  const create = vi.fn(() => {
    const source: TestSource = {
      close: vi.fn(),
      onopen: null,
      onerror: null,
      change: undefined,
    };
    sources.push(source);
    return {
      ...source,
      addEventListener: (
        type: string,
        listener: (event: MessageEvent<string>) => void,
      ) => {
        if (type === "change")
          source.change = () => listener({} as MessageEvent);
      },
      close: source.close,
      get onopen() {
        return source.onopen;
      },
      set onopen(listener: (() => void) | null) {
        source.onopen = listener;
      },
      get onerror() {
        return source.onerror;
      },
      set onerror(listener: (() => void) | null) {
        source.onerror = listener;
      },
    };
  });
  return { sources, create };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("live refresh controller", () => {
  it("keeps manual refresh available while live mode is off", async () => {
    const refresh = vi.fn(async () => undefined);
    const controller = createLiveRefreshController({
      resource: "runs",
      refresh,
      onSnapshot: () => undefined,
      createEventSource: sourceFactory().create,
    });

    controller.refreshNow();
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("connects immediately and coalesces refresh bursts to one trailing refresh", async () => {
    const factory = sourceFactory();
    const snapshots: LiveRefreshSnapshot[] = [];
    const pending: Array<() => void> = [];
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
    );
    const controller = createLiveRefreshController({
      resource: "runs",
      refresh,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      createEventSource: factory.create,
    });

    controller.setEnabled(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(factory.create).toHaveBeenCalledWith(
      "/api/studio/changes?resources=runs",
    );
    factory.sources[0]?.onopen?.();
    expect(snapshots.at(-1)?.status).toBe("live");

    factory.sources[0]?.change?.();
    factory.sources[0]?.change?.();
    expect(refresh).toHaveBeenCalledTimes(1);

    pending.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(2);

    pending.shift()?.();
    await Promise.resolve();
    controller.dispose();
  });

  it("pauses while unavailable and uses slow fallback polling after errors", async () => {
    vi.useFakeTimers();
    const factory = sourceFactory();
    const snapshots: LiveRefreshSnapshot[] = [];
    const refresh = vi.fn(async () => undefined);
    const controller = createLiveRefreshController({
      resource: "sessions",
      refresh,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      createEventSource: factory.create,
      random: () => 0,
    });

    controller.setEnabled(true);
    await Promise.resolve();
    factory.sources[0]?.onopen?.();
    factory.sources[0]?.onerror?.();
    expect(snapshots.at(-1)?.status).toBe("reconnecting");

    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(2);

    controller.setAvailable(false);
    expect(snapshots.at(-1)?.status).toBe("paused");
    expect(factory.sources.at(-1)?.close).toHaveBeenCalled();
    const callsWhilePaused = refresh.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).toHaveBeenCalledTimes(callsWhilePaused);

    controller.dispose();
  });
});
