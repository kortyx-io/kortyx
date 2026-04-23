"use client";

import type {
  ContentPiece,
  HumanInputPiece,
  StructuredData,
} from "@kortyx/react";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { codeToHtml } from "shiki";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type ChatMessageProps = {
  id: string;
  sender: "user" | "assistant";
  content: string;
  contentPieces?: ContentPiece[];
  isStreaming?: boolean;
  chatIsStreaming?: boolean | undefined;
  onRespondToHumanInput?:
    | ((args: {
        resumeToken: string;
        requestId: string;
        selected: string[];
        text?: string;
      }) => Promise<void> | void)
    | undefined;
  onDebug?: (id: string) => void;
};

type ComposeStructuredData = {
  subject?: string;
  body?: string;
  bullets?: string[];
};

type MultiComposeStructuredData = {
  subject?: string;
  preview?: string;
  body?: string;
  highlights?: string[];
  ctas?: string[];
};

const isComposeStructuredData = (
  data: StructuredData,
): data is StructuredData & { data: ComposeStructuredData } => {
  if (data.dataType !== "reason-demo.compose") return false;
  return Boolean(data.data) && typeof data.data === "object";
};

const isMultiComposeStructuredData = (
  data: StructuredData,
): data is StructuredData & { data: MultiComposeStructuredData } => {
  if (data.dataType !== "reason-demo.multi-compose") return false;
  return Boolean(data.data) && typeof data.data === "object";
};

function StructuredDataBox({ data }: { data: StructuredData }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [highlightedCode, setHighlightedCode] = useState<string>("");

  const cleanData = useMemo(() => {
    return data.data;
  }, [data]);
  const rawJson = useMemo(
    () => JSON.stringify(cleanData, null, 2),
    [cleanData],
  );

  useEffect(() => {
    const highlightCode = async () => {
      try {
        const html = await codeToHtml(rawJson, {
          lang: "json",
          theme: "one-dark-pro",
        });
        setHighlightedCode(html);
      } catch (error) {
        console.error("Failed to highlight code:", error);
        setHighlightedCode(`<pre>${rawJson}</pre>`);
      }
    };

    if (isExpanded) highlightCode();
  }, [isExpanded, rawJson]);

  if (isComposeStructuredData(data)) {
    const draft = data.data;
    const bullets = Array.isArray(draft.bullets)
      ? draft.bullets.filter(
          (item: unknown): item is string => typeof item === "string",
        )
      : [];

    return (
      <div className="my-3 overflow-hidden border rounded-2xl border-emerald-200/70 dark:border-emerald-900/70 bg-white/90 dark:bg-slate-950/80 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-100 dark:border-emerald-950/60 bg-emerald-50/80 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3 text-xs">
            {data.node && (
              <span className="font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                {data.node}
              </span>
            )}
            <span className="font-mono text-slate-500 dark:text-slate-400">
              {data.dataType}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-emerald-600 text-white">
              {data.status}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setIsExpanded((value) => !value)}
            >
              {isExpanded ? "Hide raw" : "Show raw"}
            </Button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {draft.subject && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Subject
              </div>
              <div className="text-xl font-semibold text-slate-950 dark:text-slate-50">
                {draft.subject}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Body
            </div>
            <div className="leading-8 text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
              {draft.body || ""}
            </div>
          </div>

          {bullets.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Highlights
              </div>
              <ul className="m-0 space-y-2 list-none">
                {bullets.map((bullet: string) => (
                  <li
                    key={bullet}
                    className="flex gap-3 text-slate-700 dark:text-slate-200"
                  >
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-emerald-500" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {isExpanded &&
          (highlightedCode ? (
            <div
              className="border-t border-slate-200 dark:border-slate-800 text-xs [&_pre]:!m-0 [&_pre]:!p-4 [&_pre]:!bg-transparent [&_pre]:!whitespace-pre-wrap [&_pre]:!break-words [&_pre]:!overflow-wrap-anywhere"
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          ) : (
            <pre className="p-4 m-0 overflow-x-auto text-xs border-t border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words overflow-wrap-anywhere">
              {rawJson}
            </pre>
          ))}
      </div>
    );
  }

  if (isMultiComposeStructuredData(data)) {
    const draft = data.data;
    const highlights = Array.isArray(draft.highlights)
      ? draft.highlights.filter(
          (item: unknown): item is string => typeof item === "string",
        )
      : [];
    const ctas = Array.isArray(draft.ctas)
      ? draft.ctas.filter(
          (item: unknown): item is string => typeof item === "string",
        )
      : [];

    return (
      <div className="my-3 overflow-hidden border rounded-2xl border-sky-200/70 dark:border-sky-900/70 bg-white/90 dark:bg-slate-950/80 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-sky-100 dark:border-sky-950/60 bg-sky-50/80 dark:bg-sky-950/20">
          <div className="flex items-center gap-3 text-xs">
            {data.node && (
              <span className="font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
                {data.node}
              </span>
            )}
            <span className="font-mono text-slate-500 dark:text-slate-400">
              {data.dataType}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-sky-600 text-white">
              {data.status}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setIsExpanded((value) => !value)}
            >
              {isExpanded ? "Hide raw" : "Show raw"}
            </Button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {draft.subject && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Subject
              </div>
              <div className="text-xl font-semibold text-slate-950 dark:text-slate-50">
                {draft.subject}
              </div>
            </div>
          )}

          {draft.preview && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Preview
              </div>
              <div className="text-base font-medium text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                {draft.preview}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Body
            </div>
            <div className="leading-8 text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
              {draft.body || ""}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Highlights
              </div>
              <ul className="m-0 space-y-2 list-none">
                {highlights.map((item: string) => (
                  <li
                    key={item}
                    className="flex gap-3 text-slate-700 dark:text-slate-200"
                  >
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-sky-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Calls To Action
              </div>
              <ul className="m-0 space-y-2 list-none">
                {ctas.map((item: string) => (
                  <li
                    key={item}
                    className="flex gap-3 text-slate-700 dark:text-slate-200"
                  >
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-cyan-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {isExpanded &&
          (highlightedCode ? (
            <div
              className="border-t border-slate-200 dark:border-slate-800 text-xs [&_pre]:!m-0 [&_pre]:!p-4 [&_pre]:!bg-transparent [&_pre]:!whitespace-pre-wrap [&_pre]:!break-words [&_pre]:!overflow-wrap-anywhere"
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          ) : (
            <pre className="p-4 m-0 overflow-x-auto text-xs border-t border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words overflow-wrap-anywhere">
              {rawJson}
            </pre>
          ))}
      </div>
    );
  }

  return (
    <div className="my-3 overflow-hidden border rounded-lg border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
      <button
        type="button"
        className="w-full px-3 py-1.5 text-[11px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-300 dark:border-slate-700 font-mono flex items-center justify-between cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-left"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
          {data.node && <span className="font-semibold">{data.node}</span>}
          {data.dataType && (
            <span className="ml-2 text-slate-500 dark:text-slate-500">
              {data.dataType}
            </span>
          )}
          <span className="ml-2 text-slate-500 dark:text-slate-500">
            {data.status}
          </span>
        </div>
      </button>
      {isExpanded &&
        (highlightedCode ? (
          <div
            className="text-xs [&_pre]:!m-0 [&_pre]:!p-3 [&_pre]:!bg-transparent [&_pre]:!whitespace-pre-wrap [&_pre]:!break-words [&_pre]:!overflow-wrap-anywhere"
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        ) : (
          <pre className="p-3 m-0 overflow-x-auto text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words overflow-wrap-anywhere">
            {rawJson}
          </pre>
        ))}
    </div>
  );
}

function HumanInputBox({
  piece,
  chatIsStreaming,
  onRespondToHumanInput,
}: {
  piece: HumanInputPiece;
  chatIsStreaming?: boolean | undefined;
  onRespondToHumanInput?:
    | ((args: {
        resumeToken: string;
        requestId: string;
        selected: string[];
        text?: string;
      }) => Promise<void> | void)
    | undefined;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  // For text interrupts, don't render anything - user types response normally
  if (piece.kind === "text") {
    return null;
  }

  const isMulti = piece.kind === "multi-choice" || piece.multiple;

  return (
    <div className="my-3 overflow-hidden">
      {piece.question}

      <div className="flex flex-col max-w-sm gap-2 py-3">
        {piece.options.map((opt) =>
          isMulti ? (
            <label
              key={opt.id}
              className="flex items-start gap-3 px-3 py-2 border rounded-md border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50"
            >
              <input
                type="checkbox"
                className="mt-1"
                disabled={chatIsStreaming}
                checked={selected.includes(opt.id)}
                onChange={(e) => {
                  const next = e.target.checked;
                  setSelected((prev) =>
                    next ? [...prev, opt.id] : prev.filter((x) => x !== opt.id),
                  );
                }}
              />
              <div className="text-sm leading-snug">
                <div className="font-medium">{opt.label}</div>
                {opt.description && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {opt.description}
                  </div>
                )}
              </div>
            </label>
          ) : (
            <Button
              key={opt.id}
              size="sm"
              variant="outline"
              disabled={chatIsStreaming || !onRespondToHumanInput}
              className="justify-start h-auto px-4 py-2 text-left whitespace-normal"
              onClick={() =>
                (async () => {
                  await onRespondToHumanInput?.({
                    resumeToken: piece.resumeToken,
                    requestId: piece.requestId,
                    selected: [opt.id],
                    text: opt.label,
                  });
                })()
              }
            >
              {opt.label}
            </Button>
          ),
        )}

        {isMulti && (
          <Button
            size="sm"
            disabled={
              chatIsStreaming || selected.length === 0 || !onRespondToHumanInput
            }
            onClick={() =>
              (async () => {
                await onRespondToHumanInput?.({
                  resumeToken: piece.resumeToken,
                  requestId: piece.requestId,
                  selected,
                  text: selected.join(", "),
                });
              })()
            }
          >
            Submit ({selected.length})
          </Button>
        )}
      </div>
    </div>
  );
}

export function ChatMessage({
  id,
  sender,
  content,
  contentPieces,
  isStreaming,
  chatIsStreaming,
  onRespondToHumanInput,
  onDebug,
}: ChatMessageProps) {
  const isUser = sender === "user";
  const hasStructuredDemoCard = Boolean(
    contentPieces?.some(
      (piece) =>
        piece.type === "structured" &&
        (piece.data.dataType === "reason-demo.compose" ||
          piece.data.dataType === "reason-demo.multi-compose"),
    ),
  );

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl px-4 py-2 bg-emerald-600 text-white shadow"
            : "group relative w-full px-4 py-3 text-slate-900 dark:text-slate-100"
        }
      >
        {isUser ? (
          <div className="break-words whitespace-pre-wrap">{content}</div>
        ) : (
          <div className="prose prose-slate dark:prose-invert max-w-none prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-code:text-slate-800 dark:prose-code:text-slate-200">
            {contentPieces && contentPieces.length > 0 ? (
              <>
                {contentPieces.map((piece, idx) =>
                  piece.type === "text" ? (
                    hasStructuredDemoCard ? null : (
                      <div key={piece.id} className="relative">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                          components={{
                            p: ({ children }) => (
                              <p className="mb-2">{children}</p>
                            ),
                            h1: ({ children }) => (
                              <h1 className="mt-6 mb-4 text-2xl font-bold">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="mt-6 mb-4 text-xl font-bold">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="mt-5 mb-3 text-lg font-semibold">
                                {children}
                              </h3>
                            ),
                            ul: ({ children }) => (
                              <ul className="my-4 ml-6 list-disc">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="my-4 ml-6 list-decimal">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="mb-2">{children}</li>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className="pl-4 my-4 border-l-4 border-slate-300 dark:border-slate-600">
                                {children}
                              </blockquote>
                            ),
                            hr: () => (
                              <hr className="my-6 border-slate-300 dark:border-slate-700" />
                            ),
                            pre: ({ children }) => (
                              <pre className="p-4 my-4 overflow-x-auto rounded-lg bg-slate-900">
                                {children}
                              </pre>
                            ),
                            code: ({ children, className }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                                  {children}
                                </code>
                              ) : (
                                <code className={className}>{children}</code>
                              );
                            },
                          }}
                        >
                          {piece.content || ""}
                        </ReactMarkdown>
                        {isStreaming && idx === contentPieces.length - 1 && (
                          <span className="inline-flex ml-1 align-middle">
                            <span className="rounded-full size-2 bg-slate-400 dark:bg-slate-500 animate-pulse" />
                          </span>
                        )}
                      </div>
                    )
                  ) : piece.type === "error" ? (
                    <Alert key={piece.id} variant="destructive">
                      <AlertCircleIcon className="w-4 h-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{piece.content}</AlertDescription>
                    </Alert>
                  ) : piece.type === "interrupt" ? (
                    <HumanInputBox
                      key={piece.id}
                      piece={piece}
                      chatIsStreaming={chatIsStreaming}
                      onRespondToHumanInput={onRespondToHumanInput}
                    />
                  ) : (
                    <StructuredDataBox key={piece.id} data={piece.data} />
                  ),
                )}
                {isStreaming &&
                  contentPieces[contentPieces.length - 1]?.type ===
                    "structured" && (
                    <div className="flex items-center gap-2 my-2">
                      <span className="rounded-full size-2 bg-slate-400 dark:bg-slate-500 animate-pulse" />
                    </div>
                  )}
              </>
            ) : (
              <>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    p: ({ children }) => <p className="mb-4">{children}</p>,
                    h1: ({ children }) => (
                      <h1 className="mt-6 mb-4 text-2xl font-bold">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="mt-6 mb-4 text-xl font-bold">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="mt-5 mb-3 text-lg font-semibold">
                        {children}
                      </h3>
                    ),
                    ul: ({ children }) => (
                      <ul className="my-4 ml-6 list-disc">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="my-4 ml-6 list-decimal">{children}</ol>
                    ),
                    li: ({ children }) => <li className="mb-2">{children}</li>,
                    blockquote: ({ children }) => (
                      <blockquote className="pl-4 my-4 border-l-4 border-slate-300 dark:border-slate-600">
                        {children}
                      </blockquote>
                    ),
                    hr: () => (
                      <hr className="my-6 border-slate-300 dark:border-slate-700" />
                    ),
                    pre: ({ children }) => (
                      <pre className="p-4 my-4 overflow-x-auto rounded-lg bg-slate-900">
                        {children}
                      </pre>
                    ),
                    code: ({ children, className }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                          {children}
                        </code>
                      ) : (
                        <code className={className}>{children}</code>
                      );
                    },
                  }}
                >
                  {content || ""}
                </ReactMarkdown>
                {isStreaming && (
                  <span className="inline-flex ml-1 align-middle">
                    <span className="rounded-full size-4 bg-slate-400 dark:bg-slate-500 animate-pulse" />
                  </span>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(content)}
                title="Copy message"
              >
                <CopyIcon className="size-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDebug?.(id)}>
                <EyeIcon className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
