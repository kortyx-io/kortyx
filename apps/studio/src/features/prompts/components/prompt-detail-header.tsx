"use client";
import { ArrowLeft, Maximize2, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDetailDrawer } from "@/components/detail/detail-drawer";
import { Button } from "@/components/ui/button";
import { PromptLiveBadge } from "./prompt-badges";

const OverflowContext = createContext(true);

// Menus are portalled; React context keeps their overflow items in sync with
// the header's actual container width instead of the window breakpoint.
export function PromptHeaderOverflow({ children }: { children: ReactNode }) {
  return useContext(OverflowContext) ? children : null;
}

/** One header for intercepted drawers, expanded drawers and direct routes. */
export function PromptDetailHeader({
  title,
  promptKey,
  category,
  version,
  live,
  draft = false,
  onBack,
  children,
}: {
  title: string;
  promptKey: string;
  category?: string;
  version?: number;
  live?: boolean;
  draft?: boolean;
  onBack?: () => void;
  children?: ReactNode;
}) {
  const header = useRef<HTMLElement>(null);
  const [overflow, setOverflow] = useState(true);
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const update = () =>
      setOverflow(element.getBoundingClientRect().width < 672);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { navigation } = useDetailDrawer();
  const canExpand = navigation?.canExpand;
  return (
    <OverflowContext.Provider value={overflow}>
      <header
        ref={header}
        data-prompt-header
        className="flex h-16 shrink-0 items-center gap-2 border-b px-3"
      >
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          aria-label={canExpand ? "Expand detail" : "Back to prompt library"}
          onClick={
            canExpand ? navigation.expand : (navigation?.close ?? onBack)
          }
        >
          {canExpand ? (
            <Maximize2 className="size-4" />
          ) : (
            <ArrowLeft className="size-4" />
          )}
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold" title={title}>
            {title}
          </h1>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="min-w-0 truncate font-mono" title={promptKey}>
              {promptKey}
            </span>
            <span
              className="hidden min-w-0 truncate @2xl/prompt-surface:inline"
              title={category}
            >
              · {category}
            </span>
            {version !== undefined && (
              <span className="flex shrink-0 items-center gap-1.5">
                {draft
                  ? `· Based on v${version} · Draft`
                  : `· v${version}${live ? "" : " · Candidate"}`}
                {!draft && live && <PromptLiveBadge />}
              </span>
            )}
          </div>
        </div>
        {children}
        {navigation?.isTop && !navigation.expanded && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="shrink-0"
            aria-label="Close detail"
            onClick={navigation.close}
          >
            <X className="size-4" />
          </Button>
        )}
      </header>
    </OverflowContext.Provider>
  );
}
