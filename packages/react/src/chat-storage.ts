type MaybePromise<T> = T | Promise<T>;
type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type PersistedChatState<TMessage> = {
  sessionId: string | null;
  workflowId: string;
  includeHistory: boolean;
  messages: TMessage[];
};

export type ChatStorage<TMessage> = {
  load: () => MaybePromise<Partial<PersistedChatState<TMessage>>>;
  save: (state: PersistedChatState<TMessage>) => MaybePromise<void>;
  clearMessages: () => MaybePromise<void>;
};

export type BrowserChatStorageKeys = {
  messages: string;
  includeHistory: string;
  sessionId: string;
  workflowId: string;
};

export type BrowserChatStorageOptions<TMessage> = {
  parseMessage: (value: unknown) => TMessage | null;
  serializeMessage: (message: TMessage) => unknown;
  maxMessages?: number | undefined;
  keys?: Partial<BrowserChatStorageKeys> | undefined;
};

const DEFAULT_STORAGE_KEYS: BrowserChatStorageKeys = {
  messages: "chat.messages.v1",
  includeHistory: "chat.includeHistory.v1",
  sessionId: "chat.sessionId",
  workflowId: "chat.workflowId",
};

const getLocalStorage = (): StorageLike | undefined => {
  const candidate = globalThis as { localStorage?: StorageLike };
  return candidate.localStorage;
};

const defaultParseMessage = <TMessage>(value: unknown): TMessage | null =>
  value as TMessage;

const defaultSerializeMessage = <TMessage>(message: TMessage): unknown =>
  message;

// TODO: Make remote/custom persistence more robust before freezing this API:
// - add debouncing so repeated message updates do not trigger a full save each time
// - surface save error handling/retry hooks instead of silently ignoring failures
// - define a conflict/version strategy for multi-tab and server-synced storage
// - support partial saves instead of rewriting the full persisted state on each change
export function createBrowserChatStorage<TMessage = unknown>(
  options?: BrowserChatStorageOptions<TMessage>,
): ChatStorage<TMessage> {
  const keys = {
    ...DEFAULT_STORAGE_KEYS,
    ...(options?.keys ?? {}),
  };
  const maxMessages = options?.maxMessages ?? 60;
  const parseMessage = options?.parseMessage ?? defaultParseMessage<TMessage>;
  const serializeMessage =
    options?.serializeMessage ?? defaultSerializeMessage<TMessage>;

  return {
    load() {
      try {
        const storage = getLocalStorage();
        if (!storage) {
          return {};
        }

        const sessionId = storage.getItem(keys.sessionId);
        const workflowId = storage.getItem(keys.workflowId) ?? "";
        const includeHistoryRaw = storage.getItem(keys.includeHistory);
        const rawMessages = storage.getItem(keys.messages);
        const parsedMessages = rawMessages
          ? (JSON.parse(rawMessages) as unknown)
          : [];
        const messages = Array.isArray(parsedMessages)
          ? parsedMessages
              .map((item) => parseMessage(item))
              .filter((message): message is TMessage => message !== null)
          : [];

        return {
          sessionId,
          workflowId,
          includeHistory: includeHistoryRaw !== "0",
          messages,
        };
      } catch {
        return {};
      }
    },

    save(state) {
      try {
        const storage = getLocalStorage();
        if (!storage) return;

        if (state.sessionId) {
          storage.setItem(keys.sessionId, state.sessionId);
        } else {
          storage.removeItem(keys.sessionId);
        }

        storage.setItem(keys.workflowId, state.workflowId);
        storage.setItem(keys.includeHistory, state.includeHistory ? "1" : "0");

        const trimmedMessages = state.messages
          .slice(-maxMessages)
          .map((message) => serializeMessage(message));

        storage.setItem(keys.messages, JSON.stringify(trimmedMessages));
      } catch {}
    },

    clearMessages() {
      try {
        const storage = getLocalStorage();
        if (!storage) return;
        storage.removeItem(keys.messages);
      } catch {}
    },
  };
}
