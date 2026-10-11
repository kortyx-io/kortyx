"use client";
import { Button } from "@/components/ui/button";
import { PromptActionSurface } from "./prompt-action-surface";
export function PromptConfirmation({
  title,
  description,
  label,
  busy,
  error,
  destructive = false,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  label: string;
  busy: boolean;
  error?: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <PromptActionSurface
      modal
      confirmation
      open
      busy={busy}
      onClose={onClose}
      title={title}
      description={description}
      actions={
        <Button
          size="sm"
          variant={destructive ? "destructive" : "default"}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Saving…" : label}
        </Button>
      }
      closeLabel="Close confirmation"
    >
      {error && (
        <div className="px-5 py-4">
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        </div>
      )}
    </PromptActionSurface>
  );
}
