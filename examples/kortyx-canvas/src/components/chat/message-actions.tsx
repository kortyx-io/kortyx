"use client";

import { BugIcon, Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { ChatbotActionButton } from "./action-button";

const COPY_RESET_MS = 1500;

type Props = {
  content: string;
  disabled?: boolean;
  onDebug?: () => void;
};

/**
 * Compact action toolbar under an assistant message.
 */
export function MessageActions({ content, disabled = false, onDebug }: Props) {
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
