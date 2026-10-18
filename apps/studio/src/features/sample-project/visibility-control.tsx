"use client";
import { SAMPLE_PROJECT } from "@kortyx/telemetry-contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { studioFeature } from "@/usage/client";

export function SampleProjectVisibility({
  visible,
  active,
  available = true,
}: {
  visible: boolean;
  active: boolean;
  available?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function change() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/preferences/sample-project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "visibility", visible: !visible }),
      });
      if (!response.ok) throw new Error();
      const result: { returnTo: string } = await response.json();
      studioFeature("studio.sample", {
        sample_action: visible ? "hide" : "show",
      });
      if (active && visible) window.location.assign(result.returnTo);
      else window.location.reload();
    } catch {
      setError("Could not save this preference. Please try again.");
      setPending(false);
    }
  }
  return (
    <div
      className="flex flex-col gap-3"
      data-tour-id={SAMPLE_PROJECT.anchors.visibility}
    >
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="sample-project-visible" className="text-sm font-medium">
          Show sample project
        </label>
        <Button
          id="sample-project-visible"
          variant="outline"
          role="switch"
          aria-checked={visible}
          aria-label="Show sample project"
          disabled={pending || !available}
          onClick={change}
        >
          {visible ? "On" : "Off"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Show the read-only sample project in the project selector. You can
        restore it here at any time.
      </p>
      {!available && (
        <p role="alert" className="text-sm text-destructive">
          Sample project preferences are unavailable. Refresh to retry.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
