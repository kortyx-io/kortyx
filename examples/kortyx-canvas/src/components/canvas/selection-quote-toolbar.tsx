"use client";

import { CornerDownRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuoteStore } from "@/hooks/use-quote-store";

type ActiveSelection = {
  text: string;
  /** Page-coordinate anchor for the floating button (selection-end point). */
  x: number;
  y: number;
};

/** Inputs/textareas tagged with this attribute participate in quoting. */
const QUOTE_SOURCE_ATTR = "data-quote-source";

function isQuoteSource(
  el: Element | null,
): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return false;
  }
  return el.hasAttribute(QUOTE_SOURCE_ATTR);
}

/**
 * Listens to text selection inside canvas EditableText fields and renders a
 * floating "Ask Kortyx Canvas" button above the selection. Clicking the button
 * stages the selected text as the pending chat quote and clears the local
 * selection. Implemented as a single document-level listener so we don't
 * sprinkle handlers on every field.
 */
export function SelectionQuoteToolbar() {
  const { setQuote } = useQuoteStore();
  const [selection, setSelection] = useState<ActiveSelection | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const computeFromActive = () => {
      const el = document.activeElement;
      if (!isQuoteSource(el)) {
        setSelection(null);
        return;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start == null || end == null || start === end) {
        setSelection(null);
        return;
      }
      const text = el.value.substring(start, end).trim();
      if (!text) {
        setSelection(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const pointer = lastPointerRef.current;
      // Anchor at the pointer's release position when we have one (so the
      // chip lands right where the user's selection ended); otherwise center
      // it above the field — used when selection is made via keyboard.
      const x = pointer ? pointer.x : rect.left + rect.width / 2;
      const y = pointer ? pointer.y : rect.top;
      setSelection({ text, x, y });
    };

    const onPointerDown = (e: PointerEvent) => {
      // Don't dismiss when clicking the toolbar itself.
      if (
        e.target instanceof Element &&
        e.target.closest("[data-quote-toolbar]")
      ) {
        return;
      }
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      // Eagerly hide while a new selection is being made.
      setSelection(null);
    };

    const onPointerUp = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      // Wait one tick so selectionStart/End reflect the final selection.
      window.setTimeout(computeFromActive, 0);
    };

    const onSelectionChange = () => {
      const el = document.activeElement;
      if (!isQuoteSource(el)) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start == null || end == null || start === end) {
        setSelection(null);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // Shift-arrow selections; also Cmd/Ctrl+A.
      if (!e.shiftKey && e.key !== "a" && e.key !== "A") return;
      window.setTimeout(computeFromActive, 0);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  if (!selection) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <button
      data-quote-toolbar
      type="button"
      onMouseDown={(e) => {
        // Keep focus inside the field so the next selection still works.
        e.preventDefault();
      }}
      onClick={() => {
        setQuote(selection.text);
        setSelection(null);
        // Collapse the selection so the toolbar doesn't reopen immediately.
        const el = document.activeElement;
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          const end = el.selectionEnd ?? 0;
          el.setSelectionRange(end, end);
        }
      }}
      style={{
        position: "fixed",
        top: Math.max(8, selection.y - 44),
        left: selection.x,
        transform: "translateX(-50%)",
      }}
      className="z-50 inline-flex items-center gap-1.5 rounded-full border border-border bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg transition hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CornerDownRight className="size-3.5" />
      Ask Kortyx Canvas
    </button>,
    document.body,
  );
}
