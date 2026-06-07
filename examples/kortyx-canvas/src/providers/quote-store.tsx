"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

/**
 * A canvas selection the user has staged to ask the chat about. Lives in
 * client state — once the user sends a chat message, the quote is folded
 * into the outgoing content as a markdown blockquote (see chat input) and
 * cleared from this store.
 */
export type QuoteStoreValue = {
  quote: string | null;
  setQuote: (next: string | null) => void;
  clearQuote: () => void;
};

export const QuoteStoreContext = createContext<QuoteStoreValue | null>(null);

export function QuoteStoreProvider({ children }: { children: ReactNode }) {
  const [quote, setQuoteState] = useState<string | null>(null);

  const setQuote = useCallback((next: string | null) => {
    setQuoteState(next && next.trim().length > 0 ? next : null);
  }, []);

  const clearQuote = useCallback(() => setQuoteState(null), []);

  const value = useMemo<QuoteStoreValue>(
    () => ({
      quote,
      setQuote,
      clearQuote,
    }),
    [quote, setQuote, clearQuote],
  );

  return (
    <QuoteStoreContext.Provider value={value}>
      {children}
    </QuoteStoreContext.Provider>
  );
}
