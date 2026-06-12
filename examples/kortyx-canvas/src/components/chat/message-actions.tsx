"use client";

import {
  BugIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitFork,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { ChatbotActionButton } from "./action-button";

const COPY_RESET_MS = 1500;

type Props = {
  content: string;
  disabled?: boolean;
  onDebug?: () => void;
  onRegenerate?: () => void;
  onRollback?: () => void;
  onFork?: () => void;
  variantControls?: {
    label: string;
    canPrevious: boolean;
    canNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
  } | null;
};

/**
 * Compact action toolbar under an assistant message.
 */
export function MessageActions({
  content,
  disabled = false,
  onDebug,
  onRegenerate,
  onRollback,
  onFork,
  variantControls,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard API can fail in non-secure contexts; ignore silently.
    }
  }, [content]);

  return (
    <div className="-ml-1 flex items-center gap-0.5">
      {variantControls ? (
        <>
          <ChatbotActionButton
            label="Previous response"
            onClick={variantControls.onPrevious}
            disabled={disabled || !variantControls.canPrevious}
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
          </ChatbotActionButton>
          <span className="min-w-8 px-0.5 text-center text-[11px] tabular-nums text-muted-foreground">
            {variantControls.label}
          </span>
          <ChatbotActionButton
            label="Next response"
            onClick={variantControls.onNext}
            disabled={disabled || !variantControls.canNext}
          >
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </ChatbotActionButton>
        </>
      ) : null}
      <ChatbotActionButton
        label={copied ? "Copied" : "Copy"}
        onClick={handleCopy}
        disabled={disabled || !content}
        active={copied}
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
      </ChatbotActionButton>
      {onRegenerate ? (
        <ChatbotActionButton
          label="Regenerate"
          onClick={onRegenerate}
          disabled={disabled}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
        </ChatbotActionButton>
      ) : null}
      {onRollback ? (
        <ChatbotActionButton
          label="Rollback"
          onClick={onRollback}
          disabled={disabled}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
        </ChatbotActionButton>
      ) : null}
      {onFork ? (
        <ChatbotActionButton
          label="Fork in new chat"
          onClick={onFork}
          disabled={disabled}
        >
          <GitFork className="size-3.5" aria-hidden="true" />
        </ChatbotActionButton>
      ) : null}
      {onDebug ? (
        <ChatbotActionButton
          label="Debug"
          onClick={onDebug}
          disabled={disabled}
        >
          <BugIcon className="size-3.5" aria-hidden="true" />
        </ChatbotActionButton>
      ) : null}
    </div>
  );
}

export function UserMessageActions({
  content,
  disabled = false,
  editDisabled = false,
  isEditing,
  onEdit,
  onSubmitEdit,
  onCancelEdit,
}: {
  content: string;
  disabled?: boolean;
  editDisabled?: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard API can fail in non-secure contexts; ignore silently.
    }
  }, [content]);

  return (
    <div className="flex items-center justify-end gap-0.5">
      <ChatbotActionButton
        label={copied ? "Copied" : "Copy"}
        onClick={handleCopy}
        disabled={disabled || !content}
        active={copied}
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
      </ChatbotActionButton>
      {isEditing ? (
        <>
          <ChatbotActionButton
            label="Submit edited message"
            onClick={onSubmitEdit}
            disabled={disabled || editDisabled}
          >
            <Send className="size-3.5" aria-hidden="true" />
          </ChatbotActionButton>
          <ChatbotActionButton
            label="Cancel edit"
            onClick={onCancelEdit}
            disabled={disabled}
          >
            <X className="size-3.5" aria-hidden="true" />
          </ChatbotActionButton>
        </>
      ) : (
        <ChatbotActionButton
          label="Edit message"
          onClick={onEdit}
          disabled={disabled || editDisabled}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </ChatbotActionButton>
      )}
    </div>
  );
}
