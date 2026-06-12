"use client";

import { ArrowUp, CornerDownRight, Square, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuoteStore } from "@/hooks/use-quote-store";
import { combineQuoteAndMessage } from "@/lib/chat-quote-format";

const TEXTAREA_MAX_HEIGHT = 160;

type Props = {
  placeholder?: string;
  disabled?: boolean;
  isStreaming?: boolean;
  canAbort?: boolean;
  onSend: (value: string) => void;
  onAbort?: () => void;
};

export function ChatInput({
  placeholder = "Ask to refine the canvas...",
  disabled = false,
  isStreaming = false,
  canAbort = false,
  onSend,
  onAbort,
}: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { quote, clearQuote } = useQuoteStore();

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on every value change
  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }, [value]);

  const handleSend = () => {
    if (disabled || isStreaming || !value.trim()) return;
    onSend(combineQuoteAndMessage(quote, value));
    setValue("");
    clearQuote();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showAbort = isStreaming && canAbort && onAbort;
  const canSend = !disabled && !isStreaming && value.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-3">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card focus-within:ring-1 focus-within:ring-ring">
        {quote ? <QuoteChip text={quote} onDismiss={clearQuote} /> : null}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          className="scrollbar-subtle-bottom-inset max-h-40 min-h-12 resize-none rounded-none border-0 bg-transparent px-4 pt-3 pr-12 pb-10 shadow-none focus-visible:ring-0 dark:bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
        />
        {showAbort ? (
          <Button
            type="button"
            size="icon"
            onClick={onAbort}
            aria-label="Stop generating"
            className="absolute right-2 bottom-2 size-8 rounded-full bg-foreground text-background hover:bg-foreground/90"
          >
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send"
            className="absolute right-2 bottom-2 size-8 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Pending-quote chip rendered inside the input container, above the
 * textarea. Shows the full quoted text, expanding the container to fit but
 * capping at a max height with an internal scroll for very long selections.
 * Dismiss via the trailing X.
 */
function QuoteChip({
  text,
  onDismiss,
}: {
  text: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-2 px-4 pt-3 pb-2 text-xs leading-relaxed text-muted-foreground">
      <CornerDownRight className="mt-0.5 size-3.5 shrink-0 opacity-70" />
      <p className="scrollbar-subtle max-h-28 flex-1 overflow-y-auto whitespace-pre-wrap break-words">
        {text}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Remove quoted text"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
