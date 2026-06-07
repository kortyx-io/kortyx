"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type ChatSessionsValue = {
  sessions: ChatSession[];
  currentChatId: string;
  /**
   * Create a fresh chat session and switch to it. No-op when the current
   * session is still empty (`title === DEFAULT_TITLE`) — there's no point
   * leaving a trail of empty sessions in the sidebar.
   */
  startNewChat: () => void;
  /** Switch to an existing chat by id. */
  switchToChat: (id: string) => void;
  /** Delete a chat from the index AND wipe its per-chat localStorage keys. */
  removeChat: (id: string) => void;
  /** Rename a chat (e.g. from the sidebar's rename dialog). Always writes. */
  updateChatTitle: (id: string, title: string) => void;
  /**
   * Auto-title a chat from a derived source (first user message). No-op
   * if the chat already has a non-default title — so a manual rename
   * isn't clobbered on the next message-state change.
   */
  autoTitleIfDefault: (id: string, title: string) => void;
};

const SESSIONS_STORAGE_KEY = "canvas-agent:chats";
const CURRENT_CHAT_STORAGE_KEY = "canvas-agent:currentChatId";
/**
 * Prefix used by per-chat storage (messages, kortyx session id, etc).
 * Building keys with this prefix in one place keeps the chat panel storage
 * and the session-deletion cleanup in sync.
 */
export const CHAT_STORAGE_PREFIX = "canvas-agent:chats:";

export const DEFAULT_CHAT_TITLE = "New chat";
const MAX_TITLE_LEN = 80;
const MAX_SESSIONS = 60;

export const ChatSessionsContext = createContext<ChatSessionsValue | null>(
  null,
);

function generateChatId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStoredSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is ChatSession =>
        !!s &&
        typeof s.id === "string" &&
        typeof s.title === "string" &&
        typeof s.createdAt === "number" &&
        typeof s.updatedAt === "number",
    );
  } catch {
    return [];
  }
}

function writeStoredSessions(sessions: ChatSession[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // best-effort
  }
}

function readStoredCurrentChatId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CURRENT_CHAT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredCurrentChatId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CURRENT_CHAT_STORAGE_KEY, id);
  } catch {
    // best-effort
  }
}

function clearPerChatStorage(chatId: string): void {
  if (typeof window === "undefined") return;
  try {
    const prefix = `${CHAT_STORAGE_PREFIX}${chatId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) window.localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

export function ChatSessionsProvider({ children }: { children: ReactNode }) {
  // Hydrate from storage on mount (not in initializer) so SSR/CSR agree —
  // we don't want `crypto.randomUUID()` to produce different ids on server
  // vs. client, and we can't read localStorage on the server anyway.
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>("");

  // Latest-state refs so the action callbacks below stay referentially
  // stable. We intentionally do not call state setters from inside other
  // setters' updater functions — under StrictMode (and concurrent rendering
  // in general) React may invoke an updater twice, and a nested
  // `setCurrentChatId(generateChatId())` would mint a fresh id on each run
  // and the two state shards (sessions / currentChatId) would diverge.
  const sessionsRef = useRef<ChatSession[]>([]);
  sessionsRef.current = sessions;
  const currentChatIdRef = useRef<string>("");
  currentChatIdRef.current = currentChatId;

  useEffect(() => {
    const stored = readStoredSessions();
    const storedId = readStoredCurrentChatId();
    if (
      stored.length > 0 &&
      storedId &&
      stored.some((s) => s.id === storedId)
    ) {
      setSessions(stored);
      setCurrentChatId(storedId);
    } else if (stored.length > 0) {
      // We have history but no valid current id — pick the most recent one.
      const sorted = [...stored].sort((a, b) => b.updatedAt - a.updatedAt);
      const first = sorted[0];
      if (first) {
        setSessions(sorted);
        setCurrentChatId(first.id);
        writeStoredCurrentChatId(first.id);
      }
    } else {
      // Fresh user — seed with one empty session.
      const id = generateChatId();
      const now = Date.now();
      const fresh: ChatSession = {
        id,
        title: DEFAULT_CHAT_TITLE,
        createdAt: now,
        updatedAt: now,
      };
      setSessions([fresh]);
      setCurrentChatId(id);
      writeStoredSessions([fresh]);
      writeStoredCurrentChatId(id);
    }
    setHydrated(true);
  }, []);

  const startNewChat = useCallback(() => {
    const prevSessions = sessionsRef.current;
    const prevCurrentId = currentChatIdRef.current;

    // Don't pile up empty drafts — if we're already on an untitled chat,
    // stay on it.
    const current = prevSessions.find((s) => s.id === prevCurrentId);
    if (current && current.title === DEFAULT_CHAT_TITLE) return;

    const id = generateChatId();
    const now = Date.now();
    const fresh: ChatSession = {
      id,
      title: DEFAULT_CHAT_TITLE,
      createdAt: now,
      updatedAt: now,
    };
    const next = [fresh, ...prevSessions].slice(0, MAX_SESSIONS);

    writeStoredSessions(next);
    writeStoredCurrentChatId(id);
    setSessions(next);
    setCurrentChatId(id);
  }, []);

  const switchToChat = useCallback((id: string) => {
    if (currentChatIdRef.current === id) return;
    writeStoredCurrentChatId(id);
    setCurrentChatId(id);
  }, []);

  const removeChat = useCallback((id: string) => {
    clearPerChatStorage(id);
    const prevSessions = sessionsRef.current;
    const prevCurrentId = currentChatIdRef.current;
    const filtered = prevSessions.filter((s) => s.id !== id);

    if (prevCurrentId !== id) {
      writeStoredSessions(filtered);
      setSessions(filtered);
      return;
    }

    // We just removed the active chat. Jump to the next-most-recent one,
    // or seed a fresh empty chat if nothing is left.
    if (filtered.length > 0) {
      const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
      const first = sorted[0];
      if (first) {
        writeStoredSessions(filtered);
        writeStoredCurrentChatId(first.id);
        setSessions(filtered);
        setCurrentChatId(first.id);
        return;
      }
    }

    const fallbackId = generateChatId();
    const now = Date.now();
    const fallback: ChatSession = {
      id: fallbackId,
      title: DEFAULT_CHAT_TITLE,
      createdAt: now,
      updatedAt: now,
    };
    writeStoredSessions([fallback]);
    writeStoredCurrentChatId(fallbackId);
    setSessions([fallback]);
    setCurrentChatId(fallbackId);
  }, []);

  const updateChatTitle = useCallback((id: string, title: string) => {
    const cleaned = title.trim().slice(0, MAX_TITLE_LEN);
    if (!cleaned) return;
    const prev = sessionsRef.current;
    let changed = false;
    const next = prev.map((s) => {
      if (s.id !== id) return s;
      if (s.title === cleaned) return s;
      changed = true;
      return { ...s, title: cleaned, updatedAt: Date.now() };
    });
    if (!changed) return;
    writeStoredSessions(next);
    setSessions(next);
  }, []);

  const autoTitleIfDefault = useCallback((id: string, title: string) => {
    const prev = sessionsRef.current;
    const current = prev.find((s) => s.id === id);
    if (!current || current.title !== DEFAULT_CHAT_TITLE) return;
    const cleaned = title.trim().slice(0, MAX_TITLE_LEN);
    if (!cleaned) return;
    const next = prev.map((s) =>
      s.id === id ? { ...s, title: cleaned, updatedAt: Date.now() } : s,
    );
    writeStoredSessions(next);
    setSessions(next);
  }, []);

  const value = useMemo<ChatSessionsValue>(
    () => ({
      sessions,
      currentChatId,
      startNewChat,
      switchToChat,
      removeChat,
      updateChatTitle,
      autoTitleIfDefault,
    }),
    [
      sessions,
      currentChatId,
      startNewChat,
      switchToChat,
      removeChat,
      updateChatTitle,
      autoTitleIfDefault,
    ],
  );

  // Hold the tree until the client has hydrated the session list so we
  // don't generate or mount with a random id during SSR (would cause a
  // hydration mismatch on first paint).
  if (!hydrated || !currentChatId) return null;

  return (
    <ChatSessionsContext.Provider value={value}>
      {children}
    </ChatSessionsContext.Provider>
  );
}
