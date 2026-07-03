import type { KortyxTelemetryEvent } from "@kortyx/hooks";

export class TelemetryHttpError extends Error {
  constructor(readonly status: number) {
    super(`Kortyx telemetry request failed (${status}).`);
  }
}

export const createDelivery = (args: {
  maxQueueSize: number;
  flushIntervalMs: number;
  send: (events: KortyxTelemetryEvent[]) => Promise<void>;
}) => {
  const queue: KortyxTelemetryEvent[] = [];
  let dropped = 0;
  let permanentFailures = 0;
  let retryAttempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  const schedule = (delay = args.flushIntervalMs) => {
    if (timer || inFlight || queue.length === 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
    if (typeof timer === "object" && "unref" in timer) timer.unref?.();
  };
  const flush = async (): Promise<void> => {
    if (inFlight) return inFlight;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (queue.length === 0) return;
    const events = queue.splice(0);
    inFlight = (async () => {
      let retry: number | undefined;
      try {
        await args.send(events);
        retryAttempt = 0;
      } catch (error) {
        const status =
          error instanceof TelemetryHttpError ? error.status : undefined;
        if (status !== undefined && status !== 429 && status < 500) {
          permanentFailures += events.length;
          return;
        }
        const overflow = Math.max(
          0,
          queue.length + events.length - args.maxQueueSize,
        );
        if (overflow) {
          dropped += overflow;
          events.splice(0, overflow);
        }
        queue.unshift(...events);
        retryAttempt += 1;
        const backoff = Math.min(30_000, 250 * 2 ** (retryAttempt - 1));
        retry = Math.floor(backoff * (0.5 + Math.random() * 0.5));
      } finally {
        inFlight = undefined;
        if (retry !== undefined) schedule(retry);
      }
    })();
    return inFlight;
  };
  return {
    enqueue: (event: KortyxTelemetryEvent) => {
      if (queue.length >= args.maxQueueSize) {
        queue.shift();
        dropped += 1;
      }
      queue.push(event);
      schedule();
    },
    flush,
    getDroppedEventCount: () => dropped,
    getPermanentDeliveryFailureCount: () => permanentFailures,
  };
};
