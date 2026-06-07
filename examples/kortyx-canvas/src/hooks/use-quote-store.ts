"use client";

import { useContext } from "react";
import {
  QuoteStoreContext,
  type QuoteStoreValue,
} from "@/providers/quote-store";

export function useQuoteStore(): QuoteStoreValue {
  const ctx = useContext(QuoteStoreContext);
  if (!ctx) {
    throw new Error("useQuoteStore must be used inside <QuoteStoreProvider>");
  }
  return ctx;
}
