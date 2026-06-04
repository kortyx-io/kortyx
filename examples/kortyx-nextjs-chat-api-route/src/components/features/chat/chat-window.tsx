import type { UseChatValue } from "@kortyx/react";
import {
  BugIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GitForkIcon,
  HistoryIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SettingsIcon,
  TrashIcon,
  Undo2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";
import { DebugSidebar } from "./debug-sidebar";
import { ParametersDrawer } from "./parameters-drawer";

export function ChatWindow({ chat }: { chat: UseChatValue }) {
  const {
    messages,
    isStreaming,
    streamContentPieces,
    streamDebug,
    lastAssistantId,
    checkpoints,
    send,
    respondToHumanInput,
    resetChat,
    regenerateFromCheckpoint,
    retryWithEdit,
    rollbackTo,
    fork,
    regenerateVariant,
    selectVariant,
    variantForMessage,
    includeHistory,
    setIncludeHistory,
    workflowId,
    setWorkflowId,
  } = chat;
  const [input, setInput] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugForId, setDebugForId] = useState<string | null>(null);
  const [parametersOpen, setParametersOpen] = useState(false);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState("");
  const [retryEdit, setRetryEdit] = useState("");
  const [checkpointStatus, setCheckpointStatus] = useState("");

  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = useCallback(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, []);
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Auto-switch debug panel to live stream when new stream starts
  useEffect(() => {
    if (isStreaming && debugOpen) {
      setDebugForId(null);
    }
  }, [isStreaming, debugOpen]);

  // Keep showing debug after stream finishes
  useEffect(() => {
    if (!isStreaming && debugOpen && debugForId === null && lastAssistantId) {
      setDebugForId(lastAssistantId);
    }
  }, [isStreaming, debugOpen, debugForId, lastAssistantId]);

  // Allow programmatic opening of debug panel (e.g., when interrupt appears)
  useEffect(() => {
    let cleanup = () => {};
    const handler = () => {
      setDebugForId(null);
      setDebugOpen(true);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("chat:open-debug", handler);
      cleanup = () => window.removeEventListener("chat:open-debug", handler);
    }
    return cleanup;
  }, []);

  const onSend = () => {
    const content = input.trim();
    if (!content) return;
    send(content);
    setInput("");
  };

  const openDebugFor = (id: string) => {
    setDebugForId(id);
    setDebugOpen(true);
  };

  const debugMessage = useMemo(
    () => messages.find((m) => m.id === debugForId),
    [messages, debugForId],
  );
  const latestCheckpoint = checkpoints.at(-1);
  const selectedCheckpoint =
    checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ??
    latestCheckpoint;

  useEffect(() => {
    if (!latestCheckpoint) {
      setSelectedCheckpointId("");
      return;
    }
    setSelectedCheckpointId((current) =>
      current && checkpoints.some((checkpoint) => checkpoint.id === current)
        ? current
        : latestCheckpoint.id,
    );
  }, [checkpoints, latestCheckpoint]);

  const runCheckpointAction = async (
    action: () => Promise<void>,
    success: string,
  ) => {
    setCheckpointStatus("");
    try {
      await action();
      setCheckpointStatus(success);
    } catch (error) {
      setCheckpointStatus(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const rollbackSelectedCheckpoint = async () => {
    if (!selectedCheckpoint) return;
    await rollbackTo(selectedCheckpoint.id);
  };

  const forkSelectedCheckpoint = async () => {
    if (!selectedCheckpoint) return;
    const result = await fork(selectedCheckpoint.id);
    setCheckpointStatus(
      `Forked from turn ${selectedCheckpoint.turnIndex} into ${result.sessionId}.`,
    );
  };

  return (
    <SidebarProvider open={debugOpen} onOpenChange={setDebugOpen}>
      <div className="w-full h-[100vh] flex">
        {/* Main Chat Area */}
        <div className="flex flex-col flex-1">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <div className="font-semibold text-slate-800 dark:text-slate-100">
              Chat
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-xs italic text-slate-500 sm:block">
                KORTYX: streaming route
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setParametersOpen(true)}
                title="Parameters"
              >
                <SettingsIcon className="size-4" />
                <span className="hidden ml-1 sm:inline">Parameters</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDebugForId(null); // show live streamDebug when no message selected
                  setDebugOpen((v) => !v);
                }}
                title="Toggle debug panel"
              >
                <BugIcon className="size-4" />
                <span className="hidden ml-1 sm:inline">Debug</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetChat();
                }}
                title="Clear chat"
              >
                <TrashIcon className="size-4" />
                Clear chat history
              </Button>
            </div>
          </div>

          <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <HistoryIcon className="size-4" />
                  <span>Checkpoints</span>
                </div>
                <select
                  value={selectedCheckpoint?.id ?? ""}
                  onChange={(event) =>
                    setSelectedCheckpointId(event.target.value)
                  }
                  disabled={checkpoints.length === 0 || isStreaming}
                  className="h-9 max-w-[18rem] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {checkpoints.length === 0 ? (
                    <option value="">No checkpoints yet</option>
                  ) : (
                    checkpoints.map((checkpoint) => (
                      <option key={checkpoint.id} value={checkpoint.id}>
                        Turn {checkpoint.turnIndex} · {checkpoint.workflow}
                      </option>
                    ))
                  )}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedCheckpoint || isStreaming}
                  onClick={() =>
                    selectedCheckpoint
                      ? runCheckpointAction(
                          () => regenerateFromCheckpoint(selectedCheckpoint.id),
                          `Regenerated from turn ${selectedCheckpoint.turnIndex}.`,
                        )
                      : undefined
                  }
                  title="Regenerate from selected checkpoint"
                >
                  <RefreshCwIcon className="size-4" />
                  <span className="hidden sm:inline">Regenerate</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!lastAssistantId || isStreaming}
                  onClick={() =>
                    lastAssistantId
                      ? runCheckpointAction(async () => {
                          const group =
                            await regenerateVariant(lastAssistantId);
                          setCheckpointStatus(
                            `Generated response ${group.variants.length} for this turn.`,
                          );
                        }, "Generated a response variant.")
                      : undefined
                  }
                  title="Generate another response for the latest assistant message"
                >
                  <RefreshCwIcon className="size-4" />
                  <span className="hidden sm:inline">New variant</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedCheckpoint || isStreaming}
                  onClick={() =>
                    runCheckpointAction(
                      rollbackSelectedCheckpoint,
                      `Rolled back to turn ${selectedCheckpoint?.turnIndex ?? ""}.`,
                    )
                  }
                  title="Rollback to selected checkpoint"
                >
                  <RotateCcwIcon className="size-4" />
                  <span className="hidden sm:inline">Rollback</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedCheckpoint || isStreaming}
                  onClick={() => void forkSelectedCheckpoint()}
                  title="Fork from selected checkpoint"
                >
                  <GitForkIcon className="size-4" />
                  <span className="hidden sm:inline">Fork</span>
                </Button>
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-md">
                <Input
                  value={retryEdit}
                  onChange={(event) => setRetryEdit(event.target.value)}
                  disabled={!lastAssistantId || isStreaming}
                  placeholder="Edit previous user reply..."
                  className="h-9 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !lastAssistantId || isStreaming || !retryEdit.trim()
                  }
                  onClick={() =>
                    lastAssistantId
                      ? runCheckpointAction(async () => {
                          await retryWithEdit(lastAssistantId, retryEdit);
                          setRetryEdit("");
                        }, "Retried with edited user content.")
                      : undefined
                  }
                  title="Retry latest assistant message with edited user content"
                >
                  <Undo2Icon className="size-4" />
                  <span className="hidden sm:inline">Retry edit</span>
                </Button>
              </div>
            </div>
            {checkpointStatus && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {checkpointStatus}
              </div>
            )}
          </div>

          <div className="flex flex-col flex-1 w-full max-w-4xl min-h-0 mx-auto">
            <div
              ref={listRef}
              className="flex-1 min-h-0 p-4 space-y-4 overflow-y-auto"
            >
              {messages.length === 0 && !isStreaming ? (
                <div className="flex items-center justify-center h-full text-slate-400">
                  No messages. Send a message to get started.
                </div>
              ) : (
                <>
                  {messages.map((m) => {
                    const variantGroup =
                      m.role === "assistant" ? variantForMessage(m.id) : null;
                    const selectedIndex = variantGroup
                      ? variantGroup.variants.findIndex(
                          (variant) =>
                            variant.id === variantGroup.selectedVariantId,
                        )
                      : -1;
                    const previousVariant =
                      variantGroup && selectedIndex > 0
                        ? variantGroup.variants[selectedIndex - 1]
                        : undefined;
                    const nextVariant =
                      variantGroup &&
                      selectedIndex >= 0 &&
                      selectedIndex < variantGroup.variants.length - 1
                        ? variantGroup.variants[selectedIndex + 1]
                        : undefined;

                    return (
                      <div key={m.id} className="space-y-2">
                        <ChatMessage
                          id={m.id}
                          sender={m.role}
                          content={m.content}
                          chatIsStreaming={isStreaming}
                          onRespondToHumanInput={respondToHumanInput}
                          {...(m.contentPieces
                            ? { contentPieces: m.contentPieces }
                            : {})}
                          {...(m.debug ? { debug: m.debug } : {})}
                          onDebug={openDebugFor}
                        />
                        {variantGroup && variantGroup.variants.length > 1 && (
                          <div className="flex justify-end">
                            <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                disabled={!previousVariant || isStreaming}
                                onClick={() =>
                                  previousVariant
                                    ? void selectVariant(
                                        m.id,
                                        previousVariant.id,
                                      )
                                    : undefined
                                }
                                title="Previous response"
                              >
                                <ChevronLeftIcon className="size-4" />
                              </Button>
                              <span className="min-w-10 text-center">
                                {selectedIndex + 1} /{" "}
                                {variantGroup.variants.length}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                disabled={!nextVariant || isStreaming}
                                onClick={() =>
                                  nextVariant
                                    ? void selectVariant(m.id, nextVariant.id)
                                    : undefined
                                }
                                title="Next response"
                              >
                                <ChevronRightIcon className="size-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {isStreaming && (
                    <ChatMessage
                      id="__stream__"
                      sender="assistant"
                      content=""
                      chatIsStreaming={isStreaming}
                      onRespondToHumanInput={respondToHumanInput}
                      contentPieces={streamContentPieces}
                      isStreaming={true}
                      onDebug={() => {}}
                    />
                  )}
                </>
              )}
            </div>

            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={onSend}
              disabled={isStreaming}
            />
          </div>
        </div>

        <DebugSidebar
          chunks={debugMessage?.debug ?? streamDebug}
          isStreaming={isStreaming && !debugForId}
          onClose={() => setDebugOpen(false)}
        />
      </div>

      <ParametersDrawer
        open={parametersOpen}
        onOpenChange={setParametersOpen}
        includeHistory={includeHistory}
        onIncludeHistoryChange={setIncludeHistory}
        workflowId={workflowId}
        onWorkflowIdChange={setWorkflowId}
      />
    </SidebarProvider>
  );
}
