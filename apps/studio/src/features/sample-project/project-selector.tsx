"use client";
import { SAMPLE_PROJECT } from "@kortyx/telemetry-contracts";
import { Check, ChevronDown, FlaskConical } from "lucide-react";
import { type ReactNode, type Ref, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "@/components/ui/info-tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { studioHelp } from "@/lib/studio-help";
import type { StudioSampleProjectSelection } from "@/shell/contracts";
import { studioFeature } from "@/usage/client";

export function SampleProjectSelector({
  active,
  visible,
  projectName,
  returnTo,
  realSwitcher,
  projectItems,
  projectAction,
  triggerRef,
  onCloseAutoFocus,
}: StudioSampleProjectSelection & {
  projectName: string;
  realSwitcher?: ReactNode;
  projectItems?: ReactNode;
  projectAction?: ReactNode;
  triggerRef?: Ref<HTMLButtonElement>;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<HTMLAnchorElement>(null);
  const showSample = visible || active;
  if (!showSample && !projectItems) return realSwitcher;
  async function selectSample() {
    setPending(true);
    try {
      const response = await fetch("/api/preferences/sample-project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "enter", returnTo }),
      });
      if (!response.ok) throw new Error();
      studioFeature("studio.sample", { sample_action: "select" });
      window.location.assign("/sample/runs");
    } catch {
      setError("Could not open the sample project. Please try again.");
      setPending(false);
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="sm"
          aria-label="Project"
          data-tour-id={
            showSample ? SAMPLE_PROJECT.anchors.selector : undefined
          }
        >
          <span className="max-w-40 truncate">
            {active ? SAMPLE_PROJECT.name : projectName}
          </span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="start"
        aria-label="Projects"
        className="flex max-h-(--radix-popover-content-available-height) w-72 max-w-(--radix-popover-content-available-width) flex-col gap-2 overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (projectRef.current ?? contentRef.current)?.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <p className="text-xs font-medium text-muted-foreground">
          {projectItems ? "Projects" : "Your project"}
        </p>
        {projectItems ?? (
          <Button variant="ghost" className="justify-start" asChild>
            <a
              ref={projectRef}
              href={returnTo}
              aria-current={active ? undefined : "true"}
            >
              {!active && <Check data-icon="inline-start" />}
              <span className="truncate">
                {returnTo === "/onboarding" ? "Get started" : projectName}
              </span>
            </a>
          </Button>
        )}
        {realSwitcher && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Switch project
            </span>
            {realSwitcher}
          </div>
        )}
        {showSample && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Sample project
              </p>
              <HelpCircle help={studioHelp.sampleProject} />
            </div>
            <Button
              variant="ghost"
              className="justify-start"
              aria-current={active ? "true" : undefined}
              onClick={selectSample}
              disabled={pending}
            >
              <FlaskConical data-icon="inline-start" />
              <span>{SAMPLE_PROJECT.name}</span>
              <Badge variant="secondary">Read-only</Badge>
              {active && <Check className="ml-auto" />}
            </Button>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </>
        )}
        {projectAction && (
          <>
            <Separator />
            {projectAction}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
