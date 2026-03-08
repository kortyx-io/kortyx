import { BugIcon, SettingsIcon, TrashIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useChat } from "@/hooks/use-chat";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";
import { DebugSidebar } from "./debug-sidebar";
import { ParametersDrawer } from "./parameters-drawer";

export function ChatWindow() {
  const {
    messages,
    isStreaming,
    streamContentPieces,
    streamDebug,
    lastAssistantId,
    send,
    clearChat,
    includeHistory,
    setIncludeHistory,
    workflowId,
    setWorkflowId,
  } = useChat();
  const [input, setInput] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugForId, setDebugForId] = useState<string | null>(null);
  const [parametersOpen, setParametersOpen] = useState(false);

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
                  clearChat();
                }}
                title="Clear chat"
              >
                <TrashIcon className="size-4" />
                Clear chat history
              </Button>
            </div>
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
                  {messages.map((m) => (
                    <ChatMessage
                      key={m.id}
                      id={m.id}
                      sender={m.role}
                      content={m.content}
                      {...(m.contentPieces
                        ? { contentPieces: m.contentPieces }
                        : {})}
                      {...(m.debug ? { debug: m.debug } : {})}
                      onDebug={openDebugFor}
                    />
                  ))}

                  {isStreaming && (
                    <ChatMessage
                      id="__stream__"
                      sender="assistant"
                      content=""
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
