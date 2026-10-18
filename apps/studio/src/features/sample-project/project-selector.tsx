"use client";
import { SAMPLE_PROJECT } from "@kortyx/telemetry-contracts";
import { Check, ChevronDown, FlaskConical } from "lucide-react";
import { type ReactNode, useState } from "react";
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
import { studioFeature } from "@/usage/client";

export function SampleProjectSelector({
  active,
  visible,
  projectName,
  returnTo,
  realSwitcher,
}: {
  active: boolean;
  visible: boolean;
  projectName: string;
  returnTo: string;
  realSwitcher?: ReactNode;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (!visible && !active) return realSwitcher;
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
          variant="ghost"
          size="sm"
          aria-label="Project"
          data-tour-id={SAMPLE_PROJECT.anchors.selector}
        >
          <span className="max-w-40 truncate">
            {active ? SAMPLE_PROJECT.name : projectName}
          </span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Your project
        </p>
        <Button variant="ghost" className="justify-start" asChild>
          <a href={returnTo}>
            {!active && <Check data-icon="inline-start" />}
            <span className="truncate">
              {returnTo === "/onboarding" ? "Get started" : projectName}
            </span>
          </a>
        </Button>
        {realSwitcher && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Switch project
            </span>
            {realSwitcher}
          </div>
        )}
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
          onClick={selectSample}
          disabled={pending}
        >
          <FlaskConical data-icon="inline-start" />
          <span>{SAMPLE_PROJECT.name}</span>
          <Badge variant="secondary">Read-only</Badge>
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
