"use client";

import type { DiagnosticContent } from "@kortyx/telemetry-contracts";
import { AlertTriangle, CircleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import Link from "@/components/scoped-link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorDetails } from "./error-details";

export type ErrorNotice = {
  id: string;
  severity: "error" | "warning";
  code: string;
  message: string;
  summary?: string;
  context?: string;
  href?: string;
  diagnosticId?: string;
  exception?: DiagnosticContent;
  details?: ReactNode;
};

/** At most one line per severity; every occurrence remains accessible in the dialog. */
export function ErrorNotices({
  items,
  environment,
}: {
  items: ErrorNotice[];
  environment: string;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selection);
  return (
    <>
      <section className="space-y-1" aria-label="Errors and warnings">
        {(["warning", "error"] as const).map((severity) => {
          const group = items.filter((item) => item.severity === severity);
          const first = group[0];
          if (!first) return null;
          const Icon = severity === "error" ? CircleAlert : AlertTriangle;
          return (
            <button
              key={severity}
              type="button"
              onClick={() => setSelection(first.id)}
              className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring ${severity === "error" ? "bg-red-500/5 text-red-700 dark:text-red-400" : "bg-amber-500/5 text-amber-700 dark:text-amber-400"}`}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {first.summary ?? first.message}
              </span>
              <span className="shrink-0">
                {group.length > 1
                  ? `${group.length} ${severity === "error" ? "errors" : "warnings"} · `
                  : ""}
                Details
              </span>
            </button>
          );
        })}
      </section>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
      >
        <DialogContent className="flex max-h-[85dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <div className="shrink-0 border-b px-5 py-4 pr-12">
            <DialogTitle className="text-sm font-semibold">
              Errors and warnings
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              {items.length} recorded{" "}
              {items.length === 1 ? "occurrence" : "occurrences"}. Inspect the
              original error and affected execution.
            </DialogDescription>
          </div>
          {selected && (
            <div className="flex min-h-0 flex-1 flex-col overflow-auto sm:flex-row">
              {items.length > 1 && (
                <nav
                  aria-label="Error occurrences"
                  className="max-h-48 shrink-0 overflow-auto border-b sm:max-h-none sm:w-64 sm:border-r sm:border-b-0"
                >
                  <ul className="space-y-1 p-2">
                    {items.map((item, index) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={
                            item.id === selected.id ? "true" : undefined
                          }
                          onClick={() => setSelection(item.id)}
                          className={`w-full rounded-md p-2 text-left text-xs hover:bg-muted ${item.id === selected.id ? "bg-muted" : ""}`}
                        >
                          <span className="mb-1 block text-[10px] text-muted-foreground">
                            {index + 1} · {item.context ?? item.code}
                          </span>
                          <span className="line-clamp-2 [overflow-wrap:anywhere]">
                            {item.message}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
              <div className="min-w-0 flex-1 space-y-4 overflow-auto p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {selected.context ? `${selected.context} · ` : ""}
                    {selected.code}
                  </p>
                  {selected.href && (
                    <Button asChild variant="secondary" size="xs">
                      <Link href={selected.href}>View affected execution</Link>
                    </Button>
                  )}
                </div>
                <ErrorDetails
                  key={selected.id}
                  message={selected.message}
                  diagnosticId={selected.diagnosticId}
                  environment={environment}
                  exception={selected.exception}
                />
                {selected.details}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ErrorDialogTrigger({
  diagnosticId,
  environment,
  message = "Recorded execution error",
}: {
  diagnosticId: string;
  environment: string;
  message?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="link" size="inline" onClick={() => setOpen(true)}>
        View error details
      </Button>
      <DialogContent className="max-h-[85dvh] max-w-3xl overflow-auto">
        <DialogTitle>Error details</DialogTitle>
        <DialogDescription className="sr-only">
          Original exception and diagnostic evidence
        </DialogDescription>
        <ErrorDetails
          message={message}
          diagnosticId={diagnosticId}
          environment={environment}
        />
      </DialogContent>
    </Dialog>
  );
}
