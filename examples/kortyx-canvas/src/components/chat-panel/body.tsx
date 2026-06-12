"use client";

import { ChatInput } from "@/components/chat/input";
import { ChatMessages } from "@/components/chat/messages";
import {
  PICK_AGENT_INTERRUPT_ID,
  PICK_BRIEF_INTERRUPT_ID,
} from "@/lib/protocol";
import { useChatPanel } from "./context";

/**
 * Chat conversation surface — messages stream, error banner, composer.
 * Header lives separately so it can span the full window width above
 * both this body and the canvas.
 */
export function ChatBody() {
  const {
    chat,
    sendMessage,
    setResolvedId,
    openDebugForMessage,
    checkpointStatus,
    regenerateAssistantMessage,
    selectAssistantVariant,
    rollbackToMessage,
    forkInNewChat,
    retryWithEditedMessage,
  } = useChatPanel();

  return (
    <section className="flex h-full min-h-0 flex-col bg-card">
      {checkpointStatus ? (
        <div className="border-b border-border px-3 py-2 text-muted-foreground text-xs">
          {checkpointStatus}
        </div>
      ) : null}
      <ChatMessages
        messages={chat.messages}
        streamPieces={chat.streamContentPieces}
        isStreaming={chat.isStreaming}
        variantForMessage={chat.variantForMessage}
        onSelectVariant={selectAssistantVariant}
        onRegenerateMessage={regenerateAssistantMessage}
        onRollbackMessage={rollbackToMessage}
        onForkMessage={forkInNewChat}
        onRetryWithEdit={retryWithEditedMessage}
        onRespondToInterrupt={(piece, response) => {
          const [firstId] = response.selected;
          const firstLabel = response.text;
          // Stash the picker selection so future canvas-creation runs can
          // skip the picker entirely. Keyed by interrupt schemaId so the
          // store knows whether it was the brief or agent picker.
          const kind = piece.schemaId ?? piece.interruptId;
          if (kind === PICK_BRIEF_INTERRUPT_ID && firstId) {
            setResolvedId("brief", { id: firstId, label: firstLabel });
          }
          if (kind === PICK_AGENT_INTERRUPT_ID && firstId) {
            setResolvedId("agent", { id: firstId, label: firstLabel });
          }
          void chat.respondToInterrupt(piece, response);
        }}
        onDebugMessage={openDebugForMessage}
        emptyState={
          <div className="max-w-sm text-center text-sm text-muted-foreground">
            Describe a product idea or choose a demo brief. The agent will draft
            a discovery canvas you can refine.
          </div>
        }
      />

      {chat.error ? (
        <div className="mx-3 mb-2 flex items-start justify-between gap-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>{chat.error.message}</span>
          <button
            type="button"
            onClick={chat.clearError}
            className="font-medium underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <ChatInput
        isStreaming={chat.isStreaming}
        canAbort={chat.canAbort}
        onSend={sendMessage}
        onAbort={chat.abort}
      />
    </section>
  );
}
