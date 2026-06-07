"use client";

import { BugIcon, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useDiscoveryCanvasStore } from "@/hooks/use-canvas-store";
import { useChatPanel } from "./context";

/**
 * Top bar shown above both the chat body and the canvas. Hosts the agent
 * facilitatorStyle and the canvas open/close toggle. "New chat" lives in the
 * sidebar.
 */
export function ChatHeader() {
  const { isDebugOpen, setDebugOpen, setDebugForMessageId, setDebugLiveMode } =
    useChatPanel();
  const { hasContent, isCanvasOpen, setCanvasOpen } = useDiscoveryCanvasStore();

  const toggleDebug = () => {
    const nextOpen = !isDebugOpen;
    if (nextOpen) {
      setDebugForMessageId(null);
      setDebugLiveMode(true);
    }
    setDebugOpen(nextOpen);
    if (nextOpen) setCanvasOpen(false);
  };

  const toggleCanvas = () => {
    setDebugOpen(false);
    setCanvasOpen(!isCanvasOpen);
  };

  return (
    <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
      <div className="flex flex-1 flex-col my-2">
        <h2 className="text-sm font-semibold leading-tight">AI Canvas Agent</h2>
      </div>
      <button
        type="button"
        onClick={toggleDebug}
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={isDebugOpen ? "Hide debug panel" : "Show debug panel"}
        aria-pressed={isDebugOpen}
        title={isDebugOpen ? "Hide debug panel" : "Show debug panel"}
      >
        <BugIcon className="size-4" />
      </button>
      {hasContent ? (
        <button
          type="button"
          onClick={toggleCanvas}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={isCanvasOpen ? "Hide canvas" : "Show canvas"}
          aria-pressed={isCanvasOpen}
          title={isCanvasOpen ? "Hide canvas" : "Show canvas"}
        >
          {isCanvasOpen ? (
            <PanelRightClose className="size-4" />
          ) : (
            <PanelRightOpen className="size-4" />
          )}
        </button>
      ) : null}
    </header>
  );
}
