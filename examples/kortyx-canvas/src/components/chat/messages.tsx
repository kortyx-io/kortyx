"use client";

import type {
  ChatMsg,
  ChatResponseVariantGroup,
  ContentPiece,
  HumanInputPiece,
} from "@kortyx/react";
import { CornerDownRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pickBriefPreview } from "@/components/streaming/brief-preview";
import { useTypewriter } from "@/components/typewriter";
import {
  combineQuoteAndMessage,
  extractQuoteFromMessage,
} from "@/lib/chat-quote-format";
import { CANVAS_THINKING_DATA_TYPE } from "@/lib/protocol";
import { BriefPreviewPiece } from "./brief-preview-piece";
import { DiscoveryCanvasThinkingPiece } from "./canvas-thinking-piece";
import { InterruptPiece } from "./interrupt-piece";
import { ChatMarkdown } from "./markdown";
import { MessageActions, UserMessageActions } from "./message-actions";

// `canvas.thinking` is the dedicated UI-marker channel emitted by
// `createDiscoveryCanvasNode` / `applyUpdatesNode` via `useStructuredData` BEFORE the
// model call starts, so the pill appears immediately. The real canvas data
// (`canvas.draft`, `canvas.patches`) keeps streaming on its own channels and
// is consumed silently by the chat panel — we no longer render those as
// thinking pills.
const CANVAS_THINKING_DATA_TYPES = new Set([CANVAS_THINKING_DATA_TYPE]);

function isThinkingPiece(piece: ContentPiece): boolean {
  return (
    piece.type === "structured" &&
    typeof piece.data.dataType === "string" &&
    CANVAS_THINKING_DATA_TYPES.has(piece.data.dataType)
  );
}

function isBriefPreviewPiece(piece: ContentPiece): boolean {
  return pickBriefPreview(piece) !== null;
}

function isRenderableAssistantPiece(piece: ContentPiece): boolean {
  return (
    piece.type === "text" ||
    isThinkingPiece(piece) ||
    isBriefPreviewPiece(piece)
  );
}

type Props = {
  messages: ChatMsg[];
  streamPieces: ContentPiece[];
  isStreaming: boolean;
  emptyState?: React.ReactNode;
  onRespondToInterrupt: (
    piece: HumanInputPiece,
    response: { selected: string[]; text: string },
  ) => void;
  onDebugMessage: (messageId: string) => void;
  variantForMessage: (messageId: string) => ChatResponseVariantGroup | null;
  onSelectVariant: (messageId: string, variantId: string) => void;
  onRegenerateMessage: (messageId: string) => void;
  onRollbackMessage: (messageId: string, checkpointId: string) => void;
  onForkMessage: (messageId: string, checkpointId: string) => void;
  onRetryWithEdit: (assistantMessageId: string, content: string) => void;
};

function piecesToText(pieces: ContentPiece[]): string {
  let out = "";
  for (const piece of pieces) {
    if (piece.type === "text") out += piece.content;
  }
  return out;
}

function pieceErrors(pieces: ContentPiece[]): string[] {
  return pieces
    .filter(
      (p): p is Extract<ContentPiece, { type: "error" }> => p.type === "error",
    )
    .map((p) => p.content);
}

function pieceInterrupts(pieces: ContentPiece[]): HumanInputPiece[] {
  return pieces.filter((p): p is HumanInputPiece => p.type === "interrupt");
}

function interruptToCopyText(piece: HumanInputPiece): string {
  const lines = [piece.question?.trim() || "Input requested"];
  if (piece.options.length > 0) {
    lines.push(
      ...piece.options.map((option) =>
        option.description
          ? `- ${option.label}: ${option.description}`
          : `- ${option.label}`,
      ),
    );
  }
  return lines.join("\n");
}

function messageToCopyText(
  message: ChatMsg,
  interrupts: HumanInputPiece[],
): string {
  const content = message.content.trim();
  if (content) return content;

  const pieceText = piecesToText(message.contentPieces ?? []).trim();
  if (pieceText) return pieceText;

  return interrupts.map(interruptToCopyText).join("\n\n");
}

export function ChatMessages({
  messages,
  streamPieces,
  isStreaming,
  emptyState,
  onRespondToInterrupt,
  onDebugMessage,
  variantForMessage,
  onSelectVariant,
  onRegenerateMessage,
  onRollbackMessage,
  onForkMessage,
  onRetryWithEdit,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stuckToBottomRef = useRef(true);

  // Tracks whether the live typewriter has finished revealing the most
  // recent assistant turn. Reset to `false` whenever a new stream starts;
  // bumped back to `true` by `LiveAssistantContent` once it catches up.
  // Used to (a) keep `LiveAssistantContent` mounted past the live →
  // archived transition and (b) suppress the freshly-archived assistant
  // message until the typewriter is actually done — without this, the
  // full message snaps in the moment kortyx finalises the stream.
  const [liveCaughtUp, setLiveCaughtUp] = useState(true);

  // Bumped every time a new live stream begins so `LiveAssistantContent`
  // remounts with a clean typewriter state, even if a previous turn was
  // still draining when the next one kicked off.
  const [liveTurnKey, setLiveTurnKey] = useState(0);
  const wasStreamingRef = useRef(false);

  const streamingNow = streamPieces.length > 0 || isStreaming;
  useEffect(() => {
    if (streamingNow && !wasStreamingRef.current) {
      setLiveTurnKey((k) => k + 1);
      setLiveCaughtUp(false);
    }
    wasStreamingRef.current = streamingNow;
  }, [streamingNow]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onScroll = () => {
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      stuckToBottomRef.current = distance < 32;
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  // While the typewriter is active (streaming or still draining its
  // sticky cache), keep the viewport pinned to the bottom on every
  // animation frame. The typewriter grows the layout between explicit
  // prop updates so a single end-of-render effect can't keep up — a
  // continuous rAF loop is the cheapest reliable way to follow content.
  // Loop stops the moment the turn is fully revealed.
  useEffect(() => {
    if (!streamingNow && liveCaughtUp) return;
    const node = scrollRef.current;
    if (!node) return;
    let rafId = 0;
    const tick = () => {
      if (stuckToBottomRef.current) node.scrollTop = node.scrollHeight;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [streamingNow, liveCaughtUp]);

  // One-shot scroll on archived-message changes (e.g. loading older
  // history, undo / redo) — these don't trigger the rAF loop above
  // because they happen outside an active turn.
  // biome-ignore lint/correctness/useExhaustiveDependencies: track every render that may change content
  useEffect(() => {
    if (!stuckToBottomRef.current) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const liveText = piecesToText(streamPieces);
  const liveErrors = pieceErrors(streamPieces);
  const liveInterrupts = pieceInterrupts(streamPieces);
  // Keep the live area mounted while the typewriter is still draining the
  // last turn — even after `streamPieces` clears and the finalised message
  // has moved into `messages`. Once caught up, the live area collapses and
  // the archived message renders normally.
  const hasLiveAssistant =
    liveText.length > 0 ||
    liveErrors.length > 0 ||
    isStreaming ||
    !liveCaughtUp;
  const hasLiveInterrupts = liveInterrupts.length > 0;

  // While the typewriter is still drawing the most recent turn, hide the
  // freshly-archived assistant message so it doesn't render in full beneath
  // the still-typing live bubble.
  const lastMessage =
    messages.length > 0 ? messages[messages.length - 1] : null;
  const suppressLastArchived =
    !liveCaughtUp && lastMessage?.role === "assistant";
  const visibleMessages = suppressLastArchived
    ? messages.slice(0, -1)
    : messages;

  if (messages.length === 0 && !hasLiveAssistant && !hasLiveInterrupts) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {emptyState}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="scrollbar-subtle flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
        {visibleMessages.map((message, index) => {
          const archivedInterrupts =
            message.role === "assistant"
              ? pieceInterrupts(message.contentPieces ?? [])
              : [];
          const hasContent = message.content.trim().length > 0;
          const hasInterrupts = archivedInterrupts.length > 0;
          if (message.role === "assistant" && !hasContent && !hasInterrupts) {
            return null;
          }
          const actionContent = messageToCopyText(message, archivedInterrupts);

          // The user's reply to an archived interrupt is the next user
          // message in the timeline. We use its (already-label-ified) content
          // to render the disabled picker's value when re-displayed.
          const nextUser = visibleMessages
            .slice(index + 1)
            .find((m) => m.role === "user");
          const answeredLabel = nextUser?.content;

          const nextAssistant = visibleMessages
            .slice(index + 1)
            .find((m) => m.role === "assistant");
          const variantGroup =
            message.role === "assistant" ? variantForMessage(message.id) : null;
          const variantControls = buildVariantControls({
            messageId: message.id,
            variantGroup,
            onSelectVariant,
          });
          const checkpointId = message.checkpointId;

          return (
            <div key={message.id} className="flex flex-col gap-1.5">
              {message.role === "user" ? (
                hasContent ? (
                  <UserMessage
                    content={message.content}
                    disabled={isStreaming}
                    editable={Boolean(nextAssistant)}
                    {...(nextAssistant
                      ? {
                          onSubmitEdit: (content: string) =>
                            onRetryWithEdit(nextAssistant.id, content),
                        }
                      : {})}
                  />
                ) : null
              ) : (
                <AssistantMessageContent
                  content={message.content}
                  contentPieces={message.contentPieces ?? []}
                />
              )}
              {archivedInterrupts.map((piece) => {
                // An "archived" interrupt only becomes truly read-only once the
                // user has responded. While waiting for input (the assistant
                // message is already in history but no user reply has followed
                // yet), keep the picker live and interactive.
                return (
                  <InterruptPiece
                    key={piece.id}
                    piece={piece}
                    onRespond={onRespondToInterrupt}
                    {...(answeredLabel
                      ? { disabled: true, answeredLabel }
                      : {})}
                  />
                );
              })}
              {message.role === "assistant" ? (
                <MessageActions
                  content={actionContent}
                  disabled={isStreaming}
                  onDebug={() => onDebugMessage(message.id)}
                  {...(checkpointId
                    ? {
                        onRegenerate: () => onRegenerateMessage(message.id),
                        onRollback: () =>
                          onRollbackMessage(message.id, checkpointId),
                        onFork: () => onForkMessage(message.id, checkpointId),
                      }
                    : {})}
                  variantControls={variantControls}
                />
              ) : null}
            </div>
          );
        })}

        {hasLiveAssistant || hasLiveInterrupts ? (
          // Wrap the live message body and any live interrupt in a single
          // tight stack so the Save/Cancel (or other) chips render flush
          // against the assistant text instead of as a detached widget
          // below it. Mirrors the archived-message layout above.
          <div className="flex flex-col gap-1.5">
            {hasLiveAssistant ? (
              <LiveAssistantContent
                key={liveTurnKey}
                streamPieces={streamPieces}
                fallbackText={liveText}
                isStreaming={isStreaming && liveErrors.length === 0}
                errors={liveErrors}
                onCaughtUpChange={setLiveCaughtUp}
              />
            ) : null}

            {liveInterrupts.map((piece) => (
              <InterruptPiece
                key={piece.id}
                piece={piece}
                onRespond={onRespondToInterrupt}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble({
  author,
  content,
  isStreaming = false,
  errors = [],
}: {
  author: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  errors?: string[];
}) {
  if (author === "user") {
    const { quote, body } = extractQuoteFromMessage(content);
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col gap-1.5 items-end">
          {quote ? <UserMessageQuote text={quote} /> : null}
          <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm bg-muted px-3.5 py-2 text-sm leading-relaxed text-foreground">
            {body}
            {isStreaming && body ? <BlinkingCursor /> : null}
          </div>
          {errors.length > 0 ? (
            <div className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              {errors.join("\n")}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-[85%] flex-col gap-1 text-foreground">
      {content ? (
        <ChatMarkdown content={content} isStreaming={isStreaming} />
      ) : isStreaming ? (
        <StreamingDots />
      ) : null}
      {errors.length > 0 ? (
        <div className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {errors.join("\n")}
        </div>
      ) : null}
    </div>
  );
}

function UserMessage({
  content,
  disabled,
  editable,
  onSubmitEdit,
}: {
  content: string;
  disabled: boolean;
  editable: boolean;
  onSubmitEdit?: (content: string) => void;
}) {
  const { quote, body } = extractQuoteFromMessage(content);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(body || content);

  useEffect(() => {
    if (!isEditing) setEditValue(body || content);
  }, [body, content, isEditing]);

  const submitEdit = () => {
    const next = editValue.trim();
    if (!next || next === (body || content).trim()) {
      setIsEditing(false);
      setEditValue(body || content);
      return;
    }
    onSubmitEdit?.(combineQuoteAndMessage(quote, next));
    setIsEditing(false);
  };

  return (
    <div className="flex justify-end">
      <div className="flex max-w-[85%] flex-col items-end gap-1.5">
        {quote ? <UserMessageQuote text={quote} /> : null}
        <div className="rounded-2xl rounded-br-sm bg-muted px-3.5 py-2 text-sm leading-relaxed text-foreground">
          {isEditing ? (
            <textarea
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              className="min-h-24 w-80 max-w-[70vw] resize-y rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : (
            <div className="whitespace-pre-wrap">{body}</div>
          )}
        </div>
        <UserMessageActions
          content={body}
          disabled={disabled}
          editDisabled={!editable}
          isEditing={isEditing}
          onEdit={() => setIsEditing(true)}
          onSubmitEdit={submitEdit}
          onCancelEdit={() => {
            setIsEditing(false);
            setEditValue(body || content);
          }}
        />
      </div>
    </div>
  );
}

function buildVariantControls({
  messageId,
  variantGroup,
  onSelectVariant,
}: {
  messageId: string;
  variantGroup: ChatResponseVariantGroup | null;
  onSelectVariant: (messageId: string, variantId: string) => void;
}) {
  if (!variantGroup || variantGroup.variants.length <= 1) return null;
  const selectedIndex = variantGroup.variants.findIndex(
    (variant) => variant.id === variantGroup.selectedVariantId,
  );
  if (selectedIndex < 0) return null;
  const previous =
    selectedIndex > 0 ? variantGroup.variants[selectedIndex - 1] : undefined;
  const next =
    selectedIndex >= 0 && selectedIndex < variantGroup.variants.length - 1
      ? variantGroup.variants[selectedIndex + 1]
      : undefined;

  return {
    label: `${selectedIndex + 1} / ${variantGroup.variants.length}`,
    canPrevious: Boolean(previous),
    canNext: Boolean(next),
    onPrevious: () => {
      if (previous) onSelectVariant(messageId, previous.id);
    },
    onNext: () => {
      if (next) onSelectVariant(messageId, next.id);
    },
  };
}

/**
 * Renders a finalized assistant message piece-by-piece so text bubbles and
 * `canvas.draft` / `canvas.patches` "thinking" tags appear in the order they
 * were produced. Falls back to a single bubble using `content` when no
 * `contentPieces` are present (e.g. very old persisted messages).
 */
function AssistantMessageContent({
  content,
  contentPieces,
}: {
  content: string;
  contentPieces: ContentPiece[];
}) {
  const renderable = contentPieces.filter(isRenderableAssistantPiece);
  if (renderable.length === 0) {
    if (!content.trim()) return null;
    return <MessageBubble author="assistant" content={content} />;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {renderable.map((piece) => {
        if (piece.type === "text") {
          if (!piece.content.trim()) return null;
          return (
            <MessageBubble
              key={piece.id}
              author="assistant"
              content={piece.content}
            />
          );
        }
        if (isBriefPreviewPiece(piece)) {
          return <BriefPreviewPiece key={piece.id} piece={piece} />;
        }
        return <DiscoveryCanvasThinkingPiece key={piece.id} piece={piece} />;
      })}
    </div>
  );
}

/**
 * Live-stream variant of `AssistantMessageContent`. Splits the current
 * stream into ordered chunks: each contiguous run of text pieces becomes
 * one bubble, with thinking tags interleaved at their actual positions.
 *
 * Reveal is driven by `useTypewriter`: every text segment gets an offset
 * on a single concatenated "tape" and the hook advances a cursor across
 * the whole tape. That keeps later segments (e.g. `summarizeUpdates`
 * text after a `findUpdatePaths` thinking pill) from racing ahead of
 * earlier ones — segment N stays empty until segment N-1 is fully typed
 * out, and the thinking pill pops in at the exact moment the cursor
 * passes its boundary. Speed self-adjusts: small buffer → reading speed,
 * big buffer → fast catch-up, drained to base speed on stream end.
 *
 * The trailing heartbeat dot stays visible as long as either the stream
 * itself is still running OR the typewriter still has buffer to drain —
 * whichever ends last.
 */
function LiveAssistantContent({
  streamPieces,
  fallbackText,
  isStreaming,
  errors,
  onCaughtUpChange,
}: {
  streamPieces: ContentPiece[];
  fallbackText: string;
  isStreaming: boolean;
  errors: string[];
  onCaughtUpChange: (caughtUp: boolean) => void;
}) {
  // Sticky cache of the last live pieces. Once `streamPieces` clears
  // (kortyx has moved the message to history), the typewriter would
  // otherwise unmount mid-reveal and the archived message would snap
  // in fully. Holding onto the last live pieces here lets us keep
  // typing them out until the typewriter cursor reaches the end —
  // the parent suppresses the archived twin during that window.
  const stickyRef = useRef<{ pieces: ContentPiece[]; errors: string[] } | null>(
    null,
  );
  if (streamPieces.length > 0) {
    stickyRef.current = { pieces: streamPieces, errors };
  }
  const useSticky = streamPieces.length === 0 && stickyRef.current !== null;
  const sourcePieces = useSticky
    ? (stickyRef.current?.pieces ?? streamPieces)
    : streamPieces;
  const sourceErrors = useSticky
    ? (stickyRef.current?.errors ?? errors)
    : errors;
  type TextSegment = {
    kind: "text";
    key: string;
    text: string;
    offset: number;
    end: number;
  };
  type MarkerSegment = {
    kind: "thinking" | "briefPreview";
    key: string;
    piece: ContentPiece;
    offset: number;
  };
  type Segment = TextSegment | MarkerSegment;

  // Build ordered segments AND assign each a character offset on a
  // single concatenated tape. Thinking pieces have zero width — they
  // reveal the instant the cursor reaches their position.
  const segments: Segment[] = [];
  let textBuffer = "";
  let textKeyParts: string[] = [];
  let cursor = 0;
  const flush = () => {
    if (textBuffer.length === 0) return;
    const offset = cursor;
    cursor += textBuffer.length;
    segments.push({
      kind: "text",
      key: `text-${textKeyParts.join("|")}`,
      text: textBuffer,
      offset,
      end: cursor,
    });
    textBuffer = "";
    textKeyParts = [];
  };
  for (const piece of sourcePieces) {
    if (piece.type === "text") {
      textBuffer += piece.content;
      textKeyParts.push(piece.id);
      continue;
    }
    if (isThinkingPiece(piece) || isBriefPreviewPiece(piece)) {
      flush();
      segments.push({
        kind: isBriefPreviewPiece(piece) ? "briefPreview" : "thinking",
        key: piece.id,
        piece,
        offset: cursor,
      });
    }
  }
  flush();

  const totalChars = cursor;
  // `done` is set as soon as we know no more chars are coming — i.e.
  // either the stream itself has finished OR we're already in sticky-
  // drain mode. Both cases tell the typewriter to stop catching up and
  // finish the tail at reading speed.
  const { revealed, isCaughtUp } = useTypewriter(totalChars, {
    done: !isStreaming || useSticky,
  });

  // Bubble caught-up state up so the parent can collapse the live area
  // and un-suppress the archived twin once we're done.
  useEffect(() => {
    onCaughtUpChange(isCaughtUp);
  }, [isCaughtUp, onCaughtUpChange]);

  // Clear the sticky once we've fully drained it. Keeps a fresh turn
  // from accidentally picking up stale pieces if `streamPieces` flickers
  // empty between turns.
  useEffect(() => {
    if (isCaughtUp && useSticky) stickyRef.current = null;
  }, [isCaughtUp, useSticky]);

  // Defensive fallback: if we somehow ended up with no segments but the
  // caller saw streaming content, render the concatenated text in one
  // bubble — bypass the typewriter so we never lose content to a parser
  // edge case.
  if (segments.length === 0) {
    if (
      fallbackText.length === 0 &&
      sourceErrors.length === 0 &&
      !isStreaming
    ) {
      return null;
    }
    return (
      <MessageBubble
        author="assistant"
        content={fallbackText}
        isStreaming={isStreaming}
        errors={sourceErrors}
      />
    );
  }

  // Index of the latest text segment that has at least one revealed
  // char — used to attach error rendering AND to anchor the inline
  // streaming dot.
  let lastRevealedTextIdx = -1;
  // Index of the absolute last segment the user can see right now,
  // text OR thinking pill. Drives WHERE the streaming dot lives:
  //   - last visible is text  → inline dot inside that bubble
  //   - last visible is pill  → standalone dot rendered AFTER the pill
  //   - nothing visible yet   → empty-fallback renders its own dot
  // This keeps the indicator chronologically at the tail of the live
  // area, even between text nodes when only a thinking pill is active.
  let lastVisibleIdx = -1;
  segments.forEach((seg, i) => {
    if (seg.kind === "text" && revealed > seg.offset) {
      lastRevealedTextIdx = i;
      lastVisibleIdx = i;
    } else if (
      (seg.kind === "thinking" || seg.kind === "briefPreview") &&
      revealed >= seg.offset
    ) {
      lastVisibleIdx = i;
    }
  });

  const heartbeatActive =
    (isStreaming || !isCaughtUp) && sourceErrors.length === 0;
  const lastVisibleSeg = lastVisibleIdx >= 0 ? segments[lastVisibleIdx] : null;
  const showInlineDot = heartbeatActive && lastVisibleSeg?.kind === "text";
  const showStandaloneDot =
    heartbeatActive &&
    (lastVisibleSeg?.kind === "thinking" ||
      lastVisibleSeg?.kind === "briefPreview");

  return (
    <div className="flex flex-col gap-1.5">
      {segments.map((segment, i) => {
        if (segment.kind === "text") {
          const chars = Math.max(
            0,
            Math.min(revealed - segment.offset, segment.text.length),
          );
          if (chars === 0) return null;
          const isLastTextSegment = i === lastRevealedTextIdx;
          return (
            <MessageBubble
              key={segment.key}
              author="assistant"
              content={segment.text.slice(0, chars)}
              errors={isLastTextSegment ? sourceErrors : []}
              // Inline trailing dot only when this is the chronologically
              // last visible thing — i.e. nothing (no thinking pill, no
              // newer text) has been revealed AFTER it. Otherwise the dot
              // is rendered below the segments via `showStandaloneDot` so
              // the indicator always sits at the tail of the live area.
              isStreaming={isLastTextSegment && showInlineDot}
            />
          );
        }

        // Marker pieces wait their turn on the tape — they only render
        // once the typewriter cursor reaches their position so they
        // can't appear mid-acknowledge.
        if (revealed < segment.offset) return null;
        if (segment.kind === "briefPreview") {
          return <BriefPreviewPiece key={segment.key} piece={segment.piece} />;
        }
        return (
          <DiscoveryCanvasThinkingPiece
            key={segment.key}
            piece={segment.piece}
          />
        );
      })}
      {showStandaloneDot ? (
        <div className="flex max-w-[85%] items-center text-foreground">
          <StreamingDots />
        </div>
      ) : null}
    </div>
  );
}

function StreamingDots() {
  return (
    <output
      aria-label="Streaming"
      className="inline-block size-2 animate-pulse rounded-full bg-muted-foreground/70"
    />
  );
}

function BlinkingCursor() {
  return (
    <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-current align-baseline" />
  );
}

/**
 * The canvas snippet the user quoted when sending this message. Rendered as
 * a muted chip above the user's bubble so the conversation history makes
 * clear which piece of the canvas the message was about. Clamped to three
 * lines — long quotes truncate rather than dominate the chat column.
 */
function UserMessageQuote({ text }: { text: string }) {
  return (
    <div className="flex max-w-full items-start gap-2 rounded-2xl bg-muted/60 px-3 py-1.5 text-xs leading-relaxed text-muted-foreground">
      <CornerDownRight className="mt-0.5 size-3 shrink-0 opacity-70" />
      <p className="line-clamp-3 whitespace-pre-wrap break-words">{text}</p>
    </div>
  );
}
