"use client";

import type {
  StudioUpdateSettings,
  StudioUpdateStatus,
} from "@kortyx/telemetry-contracts";
import {
  StudioUpdateStatusSchema,
  studioUpdateRunning,
} from "@kortyx/telemetry-contracts";
import { ArrowUpCircle, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const UPDATE_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function StudioUpdates({
  installedVersion,
}: {
  installedVersion: string;
}) {
  const [status, setStatus] = useState<StudioUpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sequence = useRef(0);
  const mutating = useRef(false);
  const active = studioUpdateRunning(status?.operation ?? null);

  const request = useCallback(async (data?: Record<string, unknown>) => {
    if (!data && mutating.current) return false;
    const serial = ++sequence.current;
    if (data) {
      setPending(true);
      mutating.current = true;
    }
    try {
      const response = await fetch(
        "/api/studio/updates",
        data
          ? {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Kortyx-Update": "1",
              },
              body: JSON.stringify(data),
            }
          : { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not contact the updater.");
      if (serial === sequence.current) {
        setStatus(StudioUpdateStatusSchema.parse(result));
        setError(null);
      }
      return true;
    } catch (error) {
      if (serial === sequence.current)
        setError(
          error instanceof Error
            ? error.message
            : "Could not contact the updater.",
        );
      return false;
    } finally {
      if (data) {
        setPending(false);
        mutating.current = false;
      }
    }
  }, []);

  useEffect(() => {
    void request();
    const interval = setInterval(
      () => {
        void request();
      },
      active ? 3000 : 30_000,
    );
    return () => clearInterval(interval);
  }, [request, active]);

  const changeSettings = async (next: StudioUpdateSettings) => {
    if (!status) return;
    const previous = status;
    setStatus({ ...status, settings: next });
    if (!(await request({ action: "settings", ...next }))) setStatus(previous);
  };

  const available = status?.available;
  return (
    <section
      id="updates"
      className="min-w-0 rounded-xl border bg-card/30 p-5 shadow-xs xl:col-span-2"
    >
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
          <ArrowUpCircle className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-semibold">Updates</h2>
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
            Install published Studio releases and choose when automatic updates
            run.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm">
            Installed{" "}
            <span className="font-mono">
              v{status?.current ?? installedVersion}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {available
              ? `Version ${available.version} is available.`
              : status?.checkedAt && !status.checkError
                ? "No newer published update is available."
                : "Checks for published updates every hour."}
          </p>
          {available && (
            <a
              className="mt-1 inline-block text-sm underline underline-offset-4"
              href={`https://github.com/kortyx-io/kortyx/releases/tag/studio-v${available.version}`}
              target="_blank"
              rel="noreferrer"
            >
              Release notes
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!status || pending || active}
            onClick={() => void request({ action: "check" })}
          >
            <RefreshCw className="size-4" />
            Check for updates
          </Button>
          {available && (
            <Button
              disabled={pending || active}
              onClick={() =>
                void request({ action: "update", version: available.version })
              }
            >
              {active ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="size-4" />
              )}
              Update to v{available.version}
            </Button>
          )}
        </div>
      </div>
      {(error || status?.checkError) && (
        <p
          role="alert"
          className="mt-4 rounded-lg border p-3 text-sm text-muted-foreground"
        >
          {active
            ? "Studio is restarting. Reconnecting to the updater…"
            : (error ?? status?.checkError)}
        </p>
      )}
      {status && (
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={status.settings.automatic}
              disabled={pending || active}
              onChange={(event) =>
                void changeSettings({
                  ...status.settings,
                  automatic: event.target.checked,
                })
              }
            />
            Install updates automatically
          </label>
          <label className="flex items-center gap-2 text-sm">
            Daily at
            <select
              aria-label="Automatic update hour (UTC)"
              className="rounded-md border bg-background px-2 py-1.5"
              value={status.settings.hourUtc}
              disabled={pending || active}
              onChange={(event) =>
                void changeSettings({
                  ...status.settings,
                  hourUtc: Number(event.target.value),
                })
              }
            >
              {UPDATE_HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, "0")}:00 UTC
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Updates briefly pause Studio and telemetry ingestion while a database
        backup is taken. Your data and credentials are preserved. Failed updates
        pause automatic installation and require manual recovery.
      </p>
      {status?.operation && (
        <div
          className="mt-4 rounded-lg border bg-muted/30 p-3"
          aria-live="polite"
        >
          <p className="text-sm font-medium">
            {active
              ? "Update in progress"
              : status.operation.phase === "failed"
                ? "Update failed — manual recovery required"
                : "Update complete"}
          </p>
          <ol className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
            {status.operation.messages.map((message, index) => (
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ol>
          {status.operation.backup && (
            <p className="mt-2 break-all font-mono text-xs">
              Backup: {status.operation.backup}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
