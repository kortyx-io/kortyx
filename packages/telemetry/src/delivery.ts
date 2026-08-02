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
  let inFlight: Promise<{ retryDelay: number | null }> | undefined;
  const schedule = (delay = args.flushIntervalMs) => {
    if (timer || inFlight || queue.length === 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delay);
    if (typeof timer === "object" && "unref" in timer) timer.unref?.();
  };
  const flush = async (): Promise<void> => {
    while (true) {
      if (inFlight) {
        const result = await inFlight;
        if (result.retryDelay !== null) return;
        continue;
      }
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (queue.length === 0) return;
      const events = queue.splice(0);
      const current = (async (): Promise<{ retryDelay: number | null }> => {
        try {
          await args.send(events);
          retryAttempt = 0;
          return { retryDelay: null };
        } catch (error) {
          const status =
            error instanceof TelemetryHttpError ? error.status : undefined;
          if (status !== undefined && status !== 429 && status < 500) {
            permanentFailures += events.length;
            return { retryDelay: null };
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
          return {
            retryDelay: Math.floor(backoff * (0.5 + Math.random() * 0.5)),
          };
        }
      })();
      inFlight = current;
      const result = await current;
      if (inFlight === current) inFlight = undefined;
      if (result.retryDelay !== null) {
        schedule(result.retryDelay);
        return;
      }
    }
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
