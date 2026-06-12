"use client";

import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiscoveryCanvasStore } from "@/hooks/use-canvas-store";
import { useChatPanel } from "../chat-panel";

/**
 * Anchored at the foot of the canvas. Click triggers `requestSave` on the
 * chat panel context, which switches the chat's workflow to `canvas-save`
 * for one round. While the save flow is streaming, the button shows a
 * "Checking…" state — validation runs first and can take a few seconds
 * before the persistence call (or the blocking conversational response) lands.
 *
 * Disabled while any chat stream is in-flight so a stray click during a
 * normal chat turn can't kick off an out-of-order save.
 *
 * Label flips from "Create canvas" to "Update canvas" once the canvas is
 * bound to a DB row (`savedDiscoveryCanvasId` populated from a previous successful
 * save). The helper copy updates to match.
 */
export function SaveDiscoveryCanvasButton() {
  const { requestSave, isSaving, chat, savedDiscoveryCanvasId } =
    useChatPanel();
  const { hasContent } = useDiscoveryCanvasStore();
  if (!hasContent) return null;

  // Block during any active stream — including non-save streams — so a save
  // can't race a still-running update or create turn.
  const disabled = chat.isStreaming;
  const isUpdate = Boolean(savedDiscoveryCanvasId);

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card/90 px-4 py-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
        {isUpdate
          ? "Re-running the check will update the saved discovery canvas with your latest edits."
          : "When you're happy with the discovery sections, the agent will run a quick check and then save the canvas."}
      </p>
      <Button
        type="button"
        onClick={requestSave}
        disabled={disabled}
        className="w-full sm:w-auto sm:min-w-[140px]"
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Checking…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 size-4" />
            {isUpdate ? "Update canvas" : "Create canvas"}
          </>
        )}
      </Button>
    </div>
  );
}
