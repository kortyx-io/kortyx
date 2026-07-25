import {
  type StudioChange,
  StudioChangeSchema,
} from "@kortyx/telemetry-contracts";
import type { TelemetrySqlClient } from "@kortyx/telemetry-db";
import { STUDIO_CHANGE_CHANNEL } from "@kortyx/telemetry-db";

export type StudioChangeScope = {
  organizationId: string;
  projectId: string;
};

export type StudioChangeListener = (change: StudioChange) => void;

export type StudioChangeBus = {
  start: () => Promise<void>;
  subscribe: (
    scope: StudioChangeScope,
    listener: StudioChangeListener,
  ) => () => void;
  close: () => Promise<void>;
};

const scopeKey = (scope: StudioChangeScope): string =>
  `${scope.organizationId}\0${scope.projectId}`;

const createSubscriberRegistry = () => {
  const subscribers = new Map<string, Set<StudioChangeListener>>();

  return {
    publish(change: StudioChange) {
      for (const listener of subscribers.get(scopeKey(change)) ?? []) {
        listener(change);
      }
    },
    subscribe(scope: StudioChangeScope, listener: StudioChangeListener) {
      const key = scopeKey(scope);
      const scopedSubscribers =
        subscribers.get(key) ?? new Set<StudioChangeListener>();
      scopedSubscribers.add(listener);
      subscribers.set(key, scopedSubscribers);

      return () => {
        scopedSubscribers.delete(listener);
        if (scopedSubscribers.size === 0) subscribers.delete(key);
      };
    },
    clear() {
      subscribers.clear();
    },
  };
};

export const createPostgresStudioChangeBus = (
  sql: TelemetrySqlClient,
): StudioChangeBus => {
  const registry = createSubscriberRegistry();
  let listener: Awaited<ReturnType<TelemetrySqlClient["listen"]>> | undefined;
  let starting: Promise<void> | undefined;

  return {
    async start() {
      if (listener) return;
      if (starting) return starting;
      starting = sql
        .listen(STUDIO_CHANGE_CHANNEL, (payload) => {
          const parsed = StudioChangeSchema.safeParse(
            (() => {
              try {
                return JSON.parse(payload) as unknown;
              } catch {
                return undefined;
              }
            })(),
          );
          if (parsed.success) registry.publish(parsed.data);
        })
        .then((activeListener) => {
          listener = activeListener;
        })
        .finally(() => {
          starting = undefined;
        });
      return starting;
    },
    subscribe: registry.subscribe,
    async close() {
      await starting;
      await listener?.unlisten();
      listener = undefined;
      registry.clear();
    },
  };
};

export type InMemoryStudioChangeBus = StudioChangeBus & {
  publish: (change: StudioChange) => void;
};

export const createInMemoryStudioChangeBus = (): InMemoryStudioChangeBus => {
  const registry = createSubscriberRegistry();
  return {
    start: async () => undefined,
    subscribe: registry.subscribe,
    publish: registry.publish,
    close: async () => registry.clear(),
  };
};

export const createNoopStudioChangeBus = (): StudioChangeBus => ({
  start: async () => undefined,
  subscribe: () => () => undefined,
  close: async () => undefined,
});
