"use client";

import { CircleHelp } from "lucide-react";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { DocumentationLink } from "@/components/ui/documentation-link";
import { OverlayArrow } from "@/components/ui/overlay-arrow";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { studioFeature } from "@/usage/client";
import type { HelpDefinition } from "./help-types";

export type { HelpDefinition } from "./help-types";

export function HelpCircle({
  help,
  className,
}: {
  help: HelpDefinition;
  className?: string;
}) {
  return (
    <InfoTooltip
      label={`About ${help.label}`}
      documentationUrl={help.documentationUrl}
      {...(className ? { className } : {})}
    >
      {help.description}
    </InfoTooltip>
  );
}

export type InfoTooltipProps = {
  label: string;
  children: ReactNode;
  /** Adds the shared, separate documentation footer. Use a topic-specific URL. */
  documentationUrl?: string;
  className?: string;
  trigger?: ReactElement;
  /** Keep the trigger's existing action (for example sorting or selecting a view). */
  triggerAction?: "toggle" | "preserve";
  /** Suppress help during an owning control's drag gesture. */
  disabled?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  onOpen?: () => void;
  onDocumentationClick?: () => void;
};

/** Interactive help uses a non-modal popover so its footer is keyboard reachable. */
export function InfoTooltip({
  label,
  children,
  documentationUrl,
  className,
  trigger,
  triggerAction = "toggle",
  disabled = false,
  side = "top",
  onOpen,
  onDocumentationClick,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const pinned = useRef(false);
  const ignoreFocus = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const clearTimer = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!disabled) return;
    clearTimeout(timer.current);
    openRef.current = false;
    pinned.current = false;
    setOpen(false);
  }, [disabled]);

  const changeOpen = (next: boolean) => {
    clearTimer();
    if (disabled && next) return;
    if (next && !openRef.current) {
      studioFeature("studio.help", {
        help_action: "open",
        help_placement: "card",
      });
      onOpen?.();
    }
    openRef.current = next;
    if (!next) pinned.current = false;
    setOpen(next);
  };
  const leave = () => {
    clearTimer();
    timer.current = setTimeout(() => {
      if (
        pinned.current ||
        document.activeElement === triggerRef.current ||
        contentRef.current?.contains(document.activeElement)
      )
        return;
      changeOpen(false);
    }, 250);
  };

  return (
    <Popover open={!disabled && open} onOpenChange={changeOpen}>
      <PopoverTrigger
        asChild
        ref={triggerRef}
        onPointerEnter={(event) => {
          if (disabled || event.pointerType !== "mouse") return;
          clearTimer();
          timer.current = setTimeout(
            () => changeOpen(true),
            trigger ? 1_000 : 200,
          );
        }}
        onPointerLeave={leave}
        onPointerDown={(event) => {
          if (triggerAction === "toggle") event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          if (triggerAction === "preserve") {
            pinned.current = true;
            changeOpen(true);
            return;
          }
          event.stopPropagation();
          const next = !(pinned.current && openRef.current);
          pinned.current = next;
          changeOpen(next);
        }}
        onFocus={() => {
          if (ignoreFocus.current) {
            ignoreFocus.current = false;
            return;
          }
          changeOpen(true);
        }}
        onBlur={leave}
        onKeyDown={(event) => {
          if (
            event.key === "Tab" &&
            !event.shiftKey &&
            open &&
            documentationUrl
          ) {
            const link = contentRef.current?.querySelector("a");
            if (link) {
              event.preventDefault();
              event.stopPropagation();
              link.focus();
            }
          }
        }}
      >
        {trigger ?? (
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            aria-label={label}
            className={cn("cursor-help pointer-coarse:size-11", className)}
          >
            <CircleHelp aria-hidden="true" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        aria-label={label}
        side={side}
        sideOffset={6}
        arrowPadding={10}
        collisionPadding={12}
        className="w-80 max-w-[calc(100vw-2rem)] p-0 shadow-none drop-shadow-md"
        onPointerEnter={clearTimer}
        onPointerLeave={leave}
        onBlur={leave}
        onKeyDown={(event) => {
          if (
            event.key === "Tab" &&
            event.shiftKey &&
            document.activeElement === contentRef.current?.querySelector("a")
          ) {
            event.preventDefault();
            triggerRef.current?.focus();
          }
        }}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          if (contentRef.current?.contains(document.activeElement)) {
            ignoreFocus.current = true;
            triggerRef.current?.focus();
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <PopoverArrow asChild>
          <OverlayArrow />
        </PopoverArrow>
        <div className="flex flex-col gap-1.5 p-3.5">
          <p className="text-sm font-medium">
            {label.replace(/^(?:Explain|About) /, "")}
          </p>
          <div className="text-sm leading-relaxed text-pretty text-muted-foreground">
            {children}
          </div>
        </div>
        {documentationUrl && (
          <>
            <Separator />
            <div className="p-1.5">
              <DocumentationLink
                href={documentationUrl}
                variant="footer"
                {...(onDocumentationClick
                  ? { onClick: onDocumentationClick }
                  : {})}
              />
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
